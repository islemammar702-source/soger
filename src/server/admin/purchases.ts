"use server";

import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { goodsReceiptItems, goodsReceipts, productSuppliers, products, purchaseItems, purchaseOrders } from "@/db/schema";
import { documentTotals, fmt3 } from "@/lib/totals";
import { audit } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { recordSupplierInvoice } from "../finance";
import { applyStockMovement } from "../inventory";
import { BusinessError, defaultWarehouseId } from "../orders";
import { nextDocumentNumber } from "../sequences";
import type { FormState } from "../account-actions";

const errMsg = (e: unknown) => (e instanceof BusinessError || e instanceof AccessDenied ? e.message : (console.error(e), "Opération impossible."));
const back = (path: string, msg: string, ok = true) => redirect(`${path}?${ok ? "ok" : "erreur"}=${encodeURIComponent(msg)}`);

const poSchema = z.object({
  id: z.coerce.number().int().optional(),
  supplierId: z.coerce.number().int().positive("Choisissez un fournisseur"),
  warehouseId: z.coerce.number().int().positive(),
  expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional(),
  lines: z.string(),
});
const poLine = z.object({ productId: z.number().int().positive(), description: z.string().max(300), quantity: z.number().positive().max(1e7), unitCost: z.number().min(0).max(1e9), vatRate: z.number() });

export async function savePurchaseOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const id = Number(form.get("id")) || null;
  let me;
  try {
    me = await assertStaff(id ? "purchases.update" : "purchases.create");
  } catch (e) {
    return { status: "error", message: errMsg(e) };
  }
  const parsed = poSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const d = parsed.data;
  let lines: z.infer<typeof poLine>[];
  try {
    lines = z.array(poLine).min(1, "Ajoutez au moins une ligne").max(500).parse(JSON.parse(d.lines));
  } catch (e) {
    return { status: "error", message: e instanceof z.ZodError ? e.issues[0]?.message ?? "Lignes invalides" : "Lignes invalides" };
  }
  const t = documentTotals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitCost, vatRate: l.vatRate })));
  const values = { supplierId: d.supplierId, warehouseId: d.warehouseId, expectedAt: d.expectedAt || null, notes: d.notes || null, subtotal: fmt3(t.subtotal), vatTotal: fmt3(t.vatTotal), total: fmt3(t.total) };
  let poId = id;
  try {
    await db.transaction(async (tx) => {
      if (id) {
        const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
        if (!po || !["draft", "sent"].includes(po.status)) throw new BusinessError("Seule une commande non reçue peut être modifiée.");
        await tx.update(purchaseOrders).set(values).where(eq(purchaseOrders.id, id));
        await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseOrderId, id));
      } else {
        const number = await nextDocumentNumber(tx, "purchase_order");
        const [po] = await tx.insert(purchaseOrders).values({ ...values, number, createdBy: me.id }).returning({ id: purchaseOrders.id });
        poId = po.id;
      }
      await tx.insert(purchaseItems).values(lines.map((l, i) => ({ purchaseOrderId: poId!, productId: l.productId, description: l.description, quantityOrdered: String(l.quantity), unitCost: fmt3(l.unitCost), vatRate: String(l.vatRate), lineTotal: fmt3(t.lines[i].net) })));
      await audit({ userId: me.id, module: "purchases", action: id ? "update" : "create", entityType: "purchase_order", entityId: poId, newValues: { total: values.total, lines: lines.length } }, tx);
    });
  } catch (e) {
    return { status: "error", message: errMsg(e) };
  }
  if (!id) redirect(`/admin/achats/${poId}?ok=Commande fournisseur créée`);
  return { status: "success", message: "Commande fournisseur enregistrée." };
}

export async function poStatusAction(form: FormData) {
  const id = Number(form.get("id"));
  const to = z.enum(["sent", "cancelled"]).parse(form.get("to"));
  try {
    const me = await assertStaff(to === "cancelled" ? "purchases.cancel" : "purchases.update");
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po) throw new BusinessError("Commande introuvable.");
    if (to === "cancelled" && !["draft", "sent"].includes(po.status)) throw new BusinessError("Une commande déjà (partiellement) reçue ne peut pas être annulée.");
    await db.update(purchaseOrders).set({ status: to }).where(eq(purchaseOrders.id, id));
    await audit({ userId: me.id, module: "purchases", action: `status_${to}`, entityType: "purchase_order", entityId: id, oldValues: { status: po.status } });
  } catch (e) {
    back(`/admin/achats/${id}`, errMsg(e), false);
  }
  back(`/admin/achats/${id}`, to === "sent" ? "Commande marquée comme envoyée." : "Commande annulée.");
}

/**
 * Réception (partielle ou complète) : bon de réception, entrées de stock tracées,
 * mise à jour du prix d'achat et du prix fournisseur, statut de la commande.
 */
export async function receiveAction(form: FormData) {
  const id = Number(form.get("id"));
  let msg = "";
  try {
    const me = await assertStaff("purchases.receive");
    const lines = [...form.entries()]
      .filter(([k, v]) => k.startsWith("q_") && Number(String(v).replace(",", ".")) > 0)
      .map(([k, v]) => ({ itemId: Number(k.slice(2)), quantity: Number(String(v).replace(",", ".")) }));
    if (!lines.length) throw new BusinessError("Indiquez au moins une quantité reçue.");
    const updateCost = form.get("updateCost") === "on";
    msg = await db.transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
      if (!po || !["draft", "sent", "partially_received"].includes(po.status)) throw new BusinessError("Cette commande ne peut plus être réceptionnée.");
      const items = await tx.select().from(purchaseItems).where(and(eq(purchaseItems.purchaseOrderId, id), inArray(purchaseItems.id, lines.map((l) => l.itemId))));
      const warehouseId = po.warehouseId ?? (await defaultWarehouseId(tx));
      const number = await nextDocumentNumber(tx, "goods_receipt");
      const [gr] = await tx
        .insert(goodsReceipts)
        .values({ number, purchaseOrderId: id, supplierId: po.supplierId, warehouseId, deliveryNoteRef: String(form.get("deliveryNoteRef") ?? "") || null, receivedBy: me.id })
        .returning();
      for (const l of lines) {
        const it = items.find((i) => i.id === l.itemId);
        if (!it) continue;
        const remaining = Number(it.quantityOrdered) - Number(it.quantityReceived);
        if (l.quantity > remaining + 0.0005) throw new BusinessError(`Quantité reçue supérieure au reste à recevoir pour « ${it.description} » (reste ${remaining}).`);
        await tx.insert(goodsReceiptItems).values({ goodsReceiptId: gr.id, purchaseItemId: it.id, productId: it.productId, quantity: String(l.quantity), unitCost: it.unitCost });
        await tx.update(purchaseItems).set({ quantityReceived: String(Number(it.quantityReceived) + l.quantity) }).where(eq(purchaseItems.id, it.id));
        await applyStockMovement(tx, { productId: it.productId, warehouseId, type: "purchase_receipt", quantity: l.quantity, unitCost: it.unitCost, referenceType: "goods_receipt", referenceId: gr.id, note: `${number} (${po.number})`, userId: me.id });
        if (updateCost) {
          await tx.update(products).set({ purchasePrice: it.unitCost }).where(eq(products.id, it.productId));
          await tx
            .insert(productSuppliers)
            .values({ productId: it.productId, supplierId: po.supplierId, purchasePrice: it.unitCost })
            .onConflictDoUpdate({ target: [productSuppliers.productId, productSuppliers.supplierId], set: { purchasePrice: it.unitCost, updatedAt: new Date() } });
        }
      }
      const all = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseOrderId, id));
      const complete = all.every((i) => Number(i.quantityReceived) >= Number(i.quantityOrdered) - 0.0005);
      await tx.update(purchaseOrders).set({ status: complete ? "received" : "partially_received" }).where(eq(purchaseOrders.id, id));
      await audit({ userId: me.id, module: "purchases", action: "receive", entityType: "purchase_order", entityId: id, newValues: { receipt: number, lines } }, tx);
      return `Réception ${number} enregistrée${complete ? " — commande entièrement reçue" : " (partielle)"}.`;
    });
    updateTag("products");
  } catch (e) {
    back(`/admin/achats/${id}`, errMsg(e), false);
  }
  back(`/admin/achats/${id}`, msg);
}

const supplierInvoiceSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  purchaseOrderId: z.coerce.number().int().optional().or(z.literal("").transform(() => undefined)),
  externalRef: z.string().trim().min(1, "N° de facture obligatoire").max(60),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  subtotal: z.string().transform((v) => Number(v.replace(",", "."))).refine((n) => n >= 0, "Montant HT invalide"),
  vatTotal: z.string().transform((v) => Number(v.replace(",", ".")) || 0),
  stampDuty: z.string().optional().transform((v) => (v ? Number(v.replace(",", ".")) || 0 : 0)),
  back: z.string().regex(/^\/admin\/[\w\-/]+$/),
});

export async function addSupplierInvoiceAction(form: FormData) {
  const raw = Object.fromEntries(form);
  const path = typeof raw.back === "string" && /^\/admin\/[\w\-/]+$/.test(raw.back) ? raw.back : "/admin/factures";
  let invId = 0;
  try {
    const me = await assertStaff("invoices.create");
    const d = supplierInvoiceSchema.parse(raw);
    invId = await db.transaction(async (tx) => {
      const inv = await recordSupplierInvoice(tx, { supplierId: d.supplierId, purchaseOrderId: d.purchaseOrderId ?? null, externalRef: d.externalRef, issueDate: d.issueDate, dueDate: d.dueDate || null, subtotal: d.subtotal, vatTotal: d.vatTotal, stampDuty: d.stampDuty, userId: me.id });
      await audit({ userId: me.id, module: "invoices", action: "create_supplier", entityType: "invoice", entityId: inv.id, newValues: { ref: d.externalRef, total: inv.total } }, tx);
      return inv.id;
    });
  } catch (e) {
    back(path, e instanceof z.ZodError ? e.issues[0]?.message ?? "Données invalides" : errMsg(e), false);
  }
  redirect(`/admin/factures/${invId}?ok=Facture fournisseur enregistrée`);
}
