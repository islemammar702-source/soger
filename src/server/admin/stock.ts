"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { products, stock, stockCountItems, stockCounts, warehouses } from "@/db/schema";
import { audit } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { InsufficientStockError, applyStockMovement } from "../inventory";
import type { FormState } from "../account-actions";

const qty = z
  .string()
  .trim()
  .transform((v) => Number(v.replace(",", ".")))
  .refine((n) => Number.isFinite(n) && n >= 0 && n < 1e8, "Quantité invalide");

const opSchema = z.object({
  op: z.enum(["in", "out", "set", "transfer", "supplier_return"]),
  sku: z.string().trim().min(1, "Référence obligatoire").max(60),
  warehouseId: z.coerce.number().int().positive(),
  toWarehouseId: z.coerce.number().int().positive().optional(),
  quantity: qty,
  unitCost: z.string().trim().optional(),
  note: z.string().trim().min(3, "Motif obligatoire (traçabilité)").max(300),
});

const LABEL = { in: "Entrée", out: "Sortie", set: "Ajustement", transfer: "Transfert", supplier_return: "Retour fournisseur" };

/** Opération de stock manuelle : toujours un mouvement tracé, dans une transaction. */
export async function stockOperationAction(_: FormState, form: FormData): Promise<FormState> {
  let me;
  try {
    me = await assertStaff(form.get("op") === "transfer" ? "stock.transfer" : "stock.adjust");
  } catch (e) {
    return { status: "error", message: e instanceof AccessDenied ? e.message : "Accès refusé" };
  }
  const parsed = opSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Merci de corriger les champs.", fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  const d = parsed.data;
  if (d.op !== "set" && d.quantity <= 0) return { status: "error", message: "La quantité doit être positive.", fieldErrors: { quantity: ["> 0"] } };
  if (d.op === "transfer" && (!d.toWarehouseId || d.toWarehouseId === d.warehouseId)) return { status: "error", message: "Choisissez un dépôt de destination différent.", fieldErrors: { toWarehouseId: ["Dépôt différent requis"] } };

  const [p] = await db.select({ id: products.id, name: products.name, cost: products.purchasePrice }).from(products).where(eq(products.sku, d.sku.toUpperCase()));
  if (!p) return { status: "error", message: `Référence inconnue : ${d.sku}`, fieldErrors: { sku: ["Introuvable"] } };
  const unitCost = d.unitCost ? Number(d.unitCost.replace(",", ".")).toFixed(3) : p.cost;

  try {
    const result = await db.transaction(async (tx) => {
      const base = { productId: p.id, userId: me.id, note: d.note, referenceType: "manual" };
      if (d.op === "in") return [await applyStockMovement(tx, { ...base, warehouseId: d.warehouseId, type: "adjustment", quantity: d.quantity, unitCost })];
      if (d.op === "out") return [await applyStockMovement(tx, { ...base, warehouseId: d.warehouseId, type: "adjustment", quantity: -d.quantity, unitCost })];
      if (d.op === "supplier_return") return [await applyStockMovement(tx, { ...base, warehouseId: d.warehouseId, type: "supplier_return", quantity: -d.quantity, unitCost })];
      if (d.op === "set") {
        await tx.insert(stock).values({ productId: p.id, warehouseId: d.warehouseId }).onConflictDoNothing();
        const [cur] = await tx.select({ q: stock.quantityOnHand }).from(stock).where(and(eq(stock.productId, p.id), eq(stock.warehouseId, d.warehouseId))).for("update");
        const delta = Math.round((d.quantity - Number(cur.q)) * 1000) / 1000;
        if (delta === 0) return [];
        return [await applyStockMovement(tx, { ...base, warehouseId: d.warehouseId, type: "adjustment", quantity: delta, unitCost, allowNegative: true })];
      }
      const group = randomUUID();
      return [
        await applyStockMovement(tx, { ...base, warehouseId: d.warehouseId, type: "transfer_out", quantity: -d.quantity, transferGroup: group, unitCost }),
        await applyStockMovement(tx, { ...base, warehouseId: d.toWarehouseId!, type: "transfer_in", quantity: d.quantity, transferGroup: group, unitCost }),
      ];
    });
    await audit({ userId: me.id, module: "stock", action: d.op, entityType: "product", entityId: p.id, newValues: { quantity: d.quantity, warehouseId: d.warehouseId, toWarehouseId: d.toWarehouseId, note: d.note, movements: result.map((m) => m.id) } });
    updateTag("products");
    return { status: "success", message: result.length ? `${LABEL[d.op]} enregistré(e) : ${p.name}. Nouveau stock : ${Number(result[0].quantityAfter)}.` : "Aucun écart : rien à enregistrer." };
  } catch (e) {
    if (e instanceof InsufficientStockError) return { status: "error", message: `Stock insuffisant dans ce dépôt (disponible physiquement : ${Number(e.available)}).` };
    console.error("stockOperation", e);
    return { status: "error", message: "Opération impossible." };
  }
}

/* ─── Dépôts ───────────────────────────────────────────────────────── */

export async function saveWarehouseAction(form: FormData) {
  const me = await assertStaff("settings.update");
  const d = z
    .object({ id: z.coerce.number().int().optional(), code: z.string().trim().min(2).max(10).toUpperCase(), name: z.string().trim().min(2).max(80), address: z.string().trim().max(200).optional(), isActive: z.literal("on").optional() })
    .parse(Object.fromEntries(form));
  const values = { code: d.code, name: d.name, address: d.address || null, isActive: !!d.isActive };
  try {
    if (d.id) await db.update(warehouses).set(values).where(eq(warehouses.id, d.id));
    else await db.insert(warehouses).values(values);
  } catch {
    redirect(`/admin/stock/depots?erreur=${encodeURIComponent("Ce code de dépôt existe déjà.")}`);
  }
  await audit({ userId: me.id, module: "stock", action: d.id ? "update_warehouse" : "create_warehouse", entityType: "warehouse", entityId: d.id ?? null, newValues: values });
  redirect("/admin/stock/depots?ok=Dépôt enregistré");
}

export async function setDefaultWarehouseAction(form: FormData) {
  const me = await assertStaff("settings.update");
  const id = Number(form.get("id"));
  await db.transaction(async (tx) => {
    await tx.update(warehouses).set({ isDefault: false }).where(eq(warehouses.isDefault, true));
    await tx.update(warehouses).set({ isDefault: true, isActive: true }).where(eq(warehouses.id, id));
  });
  await audit({ userId: me.id, module: "stock", action: "default_warehouse", entityType: "warehouse", entityId: id });
  redirect("/admin/stock/depots?ok=Dépôt par défaut modifié");
}

/* ─── Inventaires ──────────────────────────────────────────────────── */

export async function openStockCountAction(form: FormData) {
  const me = await assertStaff("stock.inventory");
  const warehouseId = Number(form.get("warehouseId"));
  const categoryId = Number(form.get("categoryId")) || null;
  const note = String(form.get("note") ?? "").slice(0, 200) || null;
  const id = await db.transaction(async (tx) => {
    const [count] = await tx.insert(stockCounts).values({ warehouseId, note, createdBy: me.id }).returning({ id: stockCounts.id });
    // Photo du stock théorique au moment de l'ouverture.
    await tx.execute(sql`
      insert into ${stockCountItems} (count_id, product_id, expected)
      select ${count.id}, p.id, coalesce(s.quantity_on_hand, 0)
      from ${products} p
      left join ${stock} s on s.product_id = p.id and s.warehouse_id = ${warehouseId}
      where p.is_active and p.status <> 'archived' ${categoryId ? sql`and p.category_id = ${categoryId}` : sql``}`);
    return count.id;
  });
  await audit({ userId: me.id, module: "stock", action: "open_count", entityType: "stock_count", entityId: id, newValues: { warehouseId, categoryId } });
  redirect(`/admin/stock/inventaires/${id}`);
}

/** Enregistre les quantités comptées (champs `c_<productId>`). Vide = non compté. */
export async function saveCountAction(form: FormData) {
  const me = await assertStaff("stock.inventory");
  const countId = Number(form.get("countId"));
  const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, countId));
  if (!c || c.status !== "open") redirect(`/admin/stock/inventaires/${countId}?erreur=Inventaire clôturé`);
  const entries = [...form.entries()].filter(([k]) => k.startsWith("c_"));
  await db.transaction(async (tx) => {
    for (const [k, v] of entries) {
      const raw = String(v).trim().replace(",", ".");
      const counted = raw === "" ? null : Number(raw);
      if (counted !== null && (!Number.isFinite(counted) || counted < 0)) continue;
      await tx
        .update(stockCountItems)
        .set({ counted: counted === null ? null : String(counted) })
        .where(and(eq(stockCountItems.countId, countId), eq(stockCountItems.productId, Number(k.slice(2)))));
    }
  });
  await audit({ userId: me.id, module: "stock", action: "save_count", entityType: "stock_count", entityId: countId, newValues: { lines: entries.length } });
  if (form.get("close") === "1") return closeCount(countId, me.id);
  redirect(`/admin/stock/inventaires/${countId}?ok=Comptage enregistré&${new URLSearchParams(String(form.get("filters") ?? "")).toString()}`);
}

/**
 * Clôture : pour chaque ligne comptée, l'écart avec le stock ACTUEL est enregistré
 * en mouvement « inventaire ». Les lignes non comptées sont ignorées.
 */
async function closeCount(countId: number, userId: number) {
  const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, countId));
  let moves = 0;
  await db.transaction(async (tx) => {
    const lines = await tx.select().from(stockCountItems).where(and(eq(stockCountItems.countId, countId), sql`${stockCountItems.counted} is not null`));
    const ids = lines.map((l) => l.productId);
    const current = ids.length
      ? new Map((await tx.select({ id: stock.productId, q: stock.quantityOnHand }).from(stock).where(and(eq(stock.warehouseId, c.warehouseId), inArray(stock.productId, ids)))).map((r) => [r.id, Number(r.q)]))
      : new Map<number, number>();
    for (const l of lines) {
      const delta = Math.round((Number(l.counted) - (current.get(l.productId) ?? 0)) * 1000) / 1000;
      if (delta === 0) continue;
      await applyStockMovement(tx, { productId: l.productId, warehouseId: c.warehouseId, type: "inventory", quantity: delta, referenceType: "stock_count", referenceId: countId, note: `Inventaire n°${countId}`, userId, allowNegative: true });
      moves++;
    }
    await tx.update(stockCounts).set({ status: "closed", closedAt: new Date(), closedBy: userId }).where(eq(stockCounts.id, countId));
  });
  await audit({ userId, module: "stock", action: "close_count", entityType: "stock_count", entityId: countId, newValues: { movements: moves } });
  updateTag("products");
  redirect(`/admin/stock/inventaires/${countId}?ok=${encodeURIComponent(`Inventaire clôturé : ${moves} ajustement(s) enregistré(s).`)}`);
}

export async function cancelCountAction(form: FormData) {
  const me = await assertStaff("stock.inventory");
  const countId = Number(form.get("countId"));
  await db.update(stockCounts).set({ status: "cancelled", closedAt: new Date(), closedBy: me.id }).where(and(eq(stockCounts.id, countId), eq(stockCounts.status, "open")));
  await audit({ userId: me.id, module: "stock", action: "cancel_count", entityType: "stock_count", entityId: countId });
  redirect("/admin/stock/inventaires?ok=Inventaire annulé");
}
