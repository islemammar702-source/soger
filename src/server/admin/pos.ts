"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { cashRegisters, cashSessions, customers, expenses, invoices, orders } from "@/db/schema";
import { fmt3, round3 } from "@/lib/totals";
import { formatTND } from "@/lib/utils";
import { InsufficientStockError } from "../inventory";
import { audit } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { invoiceOrder, recordPayment } from "../finance";
import { BusinessError, createOrder, defaultWarehouseId } from "../orders";
import { getSettings } from "../settings";
import { customerDueFor } from "../receivables";
import { expectedCash } from "./caisse-queries";
import { nextDocumentNumber } from "../sequences";
import type { Tx } from "../audit";

const errMsg = (e: unknown) =>
  e instanceof BusinessError || e instanceof AccessDenied
    ? e.message
    : e instanceof InsufficientStockError
      ? `Stock insuffisant : ${e.label ?? "un article"} (disponible : ${Number(e.available)}). Réduisez la quantité ou réceptionnez la marchandise.`
      : (console.error(e), "Opération impossible.");

/** Caisse principale (créée à la première utilisation). */
async function mainRegister(tx: Tx) {
  const [r] = await tx.select().from(cashRegisters).where(eq(cashRegisters.code, "CAISSE1"));
  if (r) return r;
  const warehouseId = await defaultWarehouseId(tx);
  const [created] = await tx.insert(cashRegisters).values({ code: "CAISSE1", name: "Caisse principale", warehouseId }).returning();
  return created;
}

export async function openSessionAction(form: FormData) {
  const me = await assertStaff("pos.use");
  const amount = Number(String(form.get("openingAmount") ?? "0").replace(",", ".")) || 0;
  try {
    await db.transaction(async (tx) => {
      const reg = await mainRegister(tx);
      const [open] = await tx.select().from(cashSessions).where(and(eq(cashSessions.cashRegisterId, reg.id), isNull(cashSessions.closedAt)));
      if (open) throw new BusinessError("Une session de caisse est déjà ouverte.");
      const [s] = await tx.insert(cashSessions).values({ cashRegisterId: reg.id, openedBy: me.id, openingAmount: fmt3(amount) }).returning();
      await audit({ userId: me.id, module: "pos", action: "open_session", entityType: "cash_session", entityId: s.id, newValues: { openingAmount: amount } }, tx);
    });
  } catch (e) {
    redirect(`/admin/caisse?erreur=${encodeURIComponent(errMsg(e))}`);
  }
  redirect("/admin/caisse");
}

export async function closeSessionAction(form: FormData) {
  const me = await assertStaff("pos.close_register");
  const id = Number(form.get("id"));
  const counted = Number(String(form.get("countedAmount") ?? "").replace(",", "."));
  if (!Number.isFinite(counted) || counted < 0) redirect(`/admin/caisses/${id}?erreur=${encodeURIComponent("Montant compté invalide")}`);
  let gap = 0;
  await db.transaction(async (tx) => {
    const expected = await expectedCash(tx, id);
    gap = round3(counted - expected);
    await tx.update(cashSessions).set({ closedAt: new Date(), closedBy: me.id, expectedAmount: fmt3(expected), countedAmount: fmt3(counted), notes: String(form.get("notes") ?? "") || null }).where(and(eq(cashSessions.id, id), isNull(cashSessions.closedAt)));
    await audit({ userId: me.id, module: "pos", action: "close_session", entityType: "cash_session", entityId: id, newValues: { expected, counted, gap } }, tx);
  });
  redirect(`/admin/caisses/${id}?ok=${encodeURIComponent(`Caisse clôturée. Écart : ${formatTND(gap)}`)}`);
}

const saleSchema = z.object({
  sessionId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable(),
  lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive().max(1e6), unitPrice: z.number().min(0).max(1e9), discountRate: z.number().min(0).max(100) })).min(1).max(300),
  payments: z.array(z.object({ method: z.enum(["cash", "card", "transfer", "check"]), amount: z.number().positive().max(1e9), reference: z.string().max(80).optional() })).max(5),
  invoice: z.boolean(),
  cashGiven: z.number().min(0).optional(),
});

export type SaleResult = { ok: true; orderId: number; number: string; total: number; paid: number; remaining: number; change: number; invoiceId: number | null } | { ok: false; message: string };

/** Vente en caisse : commande livrée immédiatement (sortie de stock), paiements, facture ou ticket. */
export async function posSaleAction(input: z.infer<typeof saleSchema>): Promise<SaleResult> {
  let me;
  try {
    me = await assertStaff("pos.use");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Vente invalide." };
  const d = parsed.data;
  const discounted = d.lines.some((l) => l.discountRate > 0);
  if (discounted && !me.can("pos.discount")) return { ok: false, message: "Vous n'avez pas le droit d'accorder une remise." };
  try {
    const settings = await getSettings();
    const res = await db.transaction(async (tx) => {
      const [session] = await tx.select().from(cashSessions).where(and(eq(cashSessions.id, d.sessionId), isNull(cashSessions.closedAt)));
      if (!session) throw new BusinessError("La session de caisse est fermée. Ouvrez la caisse.");
      const [reg] = await tx.select().from(cashRegisters).where(eq(cashRegisters.id, session.cashRegisterId));
      const customer = d.customerId ? (await tx.select().from(customers).where(eq(customers.id, d.customerId)))[0] : null;
      // Les prix affichés en caisse sont recalculés : modification manuelle uniquement avec la permission « remise ».
      const order = await createOrder(tx, {
        channel: "store",
        customer,
        lines: d.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: me.can("pos.discount") ? l.unitPrice : undefined, discountRate: l.discountRate })),
        status: "delivered",
        paymentMethod: d.payments[0]?.method ?? null,
        deliveryMethod: "Vente comptoir",
        createdBy: me.id,
        warehouseId: reg.warehouseId ?? undefined,
        cashSessionId: session.id,
      });
      const total = Number(order.total);
      const paid = round3(d.payments.reduce((s, p) => s + p.amount, 0));
      // Rendu monnaie : seul l'excédent payé en espèces peut être rendu.
      const cashPaid = d.payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
      const change = round3(Math.max(0, paid - total));
      if (change > cashPaid + 0.0005) throw new BusinessError("Le trop-perçu ne peut être rendu qu'en espèces.");
      if (paid < total - 0.0005 && !customer) throw new BusinessError("Paiement partiel ou à crédit : sélectionnez un client (le reste sera dû sur son compte).");
      // Plafond de crédit du client (si défini) : créances existantes + nouveau reste à payer.
      if (customer?.creditLimit && paid < total - 0.0005) {
        const [{ due }] = await tx.select({ due: customerDueFor(customer.id) }).from(sql`(select 1) as one`);
        const after = round3(Number(due) + total - paid);
        if (after > Number(customer.creditLimit) + 0.0005) throw new BusinessError(`Plafond de crédit dépassé : ${after.toFixed(3)} DT dus pour un plafond de ${Number(customer.creditLimit).toFixed(3)} DT.`);
      }
      let invoiceId: number | null = null;
      if (d.invoice) {
        if (!customer) throw new BusinessError("Une facture nécessite un client.");
        const inv = await invoiceOrder(tx, order.id, { userId: me.id, stampDuty: Number(settings.sales.stampDuty) || 0, paymentTermsDays: settings.sales.paymentTermsDays });
        invoiceId = inv.id;
      }
      // Le droit de timbre éventuel s'ajoute au montant dû sur facture.
      const due = invoiceId ? Number((await tx.select({ t: invoices.total }).from(invoices).where(eq(invoices.id, invoiceId)))[0].t) : total;
      let left = due;
      let collected = 0;
      for (const p of d.payments) {
        const amount = round3(Math.min(p.amount - (p.method === "cash" ? change : 0), left));
        if (amount <= 0) continue;
        await recordPayment(tx, { direction: "in", method: p.method, amount, customerId: customer?.id ?? null, orderId: order.id, invoiceId, cashSessionId: session.id, reference: p.reference, userId: me.id });
        left = round3(left - amount);
        collected = round3(collected + amount);
      }
      await audit({ userId: me.id, module: "pos", action: "sale", entityType: "order", entityId: order.id, newValues: { number: order.number, total, paid, change, invoiceId } }, tx);
      return { orderId: order.id, number: order.number, total: due, paid: collected, remaining: round3(due - collected), change, invoiceId };
    });
    updateTag("products");
    revalidatePath("/admin/caisse");
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/* ─── Dépenses ─────────────────────────────────────────────────────── */

const expenseSchema = z.object({
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().min(2).max(300),
  amount: z.string().transform((v) => Number(v.replace(",", "."))).refine((n) => n > 0 && n < 1e9, "Montant invalide"),
  vatAmount: z.string().optional().transform((v) => (v ? Number(v.replace(",", ".")) || 0 : 0)),
  method: z.enum(["cash", "card", "transfer", "check", "other"]),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromRegister: z.literal("on").optional(),
});

export async function addExpenseAction(form: FormData) {
  const me = await assertStaff("expenses.create");
  const parsed = expenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/depenses?erreur=${encodeURIComponent("Vérifiez les champs de la dépense.")}`);
  const d = parsed.data;
  await db.transaction(async (tx) => {
    let cashSessionId: number | null = null;
    if (d.fromRegister && d.method === "cash") {
      const [open] = await tx.select({ id: cashSessions.id }).from(cashSessions).where(isNull(cashSessions.closedAt)).limit(1);
      cashSessionId = open?.id ?? null;
    }
    const [e] = await tx
      .insert(expenses)
      .values({ category: d.category, description: d.description, amount: fmt3(d.amount), vatAmount: fmt3(d.vatAmount), method: d.method, paidAt: new Date(d.paidAt), cashSessionId, createdBy: me.id })
      .returning({ id: expenses.id });
    await audit({ userId: me.id, module: "expenses", action: "create", entityType: "expense", entityId: e.id, newValues: d }, tx);
  });
  redirect("/admin/depenses?ok=Dépense enregistrée");
}

export async function deleteExpenseAction(form: FormData) {
  const me = await assertStaff("expenses.delete");
  const id = Number(form.get("id"));
  const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (e?.cashSessionId) {
    const [s] = await db.select({ closedAt: cashSessions.closedAt }).from(cashSessions).where(eq(cashSessions.id, e.cashSessionId));
    if (s?.closedAt) redirect(`/admin/depenses?erreur=${encodeURIComponent("Dépense rattachée à une caisse clôturée : suppression impossible.")}`);
  }
  await db.delete(expenses).where(eq(expenses.id, id));
  await audit({ userId: me.id, module: "expenses", action: "delete", entityType: "expense", entityId: id, oldValues: e });
  redirect("/admin/depenses?ok=Dépense supprimée");
}

/* ─── Client rapide (depuis l'écran de vente) ──────────────────────── */

const quickCustomerSchema = z.object({
  name: z.string().trim().min(2, "Nom ou raison sociale obligatoire").max(160),
  phone: z.string().trim().regex(/^[+\d][\d\s.-]{6,19}$/, "Téléphone invalide"),
  address: z.string().trim().max(300).optional(),
  taxId: z.string().trim().max(40).optional(),
});

export type QuickCustomerResult = { ok: true; customer: { id: number; code: string; name: string; phone: string | null; pro: boolean } } | { ok: false; message: string };

export async function quickCreateCustomerAction(input: z.input<typeof quickCustomerSchema>): Promise<QuickCustomerResult> {
  let me;
  try {
    me = await assertStaff("customers.create");
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  const parsed = quickCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides" };
  const d = parsed.data;
  const pro = !!d.taxId;
  const created = await db.transaction(async (tx) => {
    const [dup] = await tx.select({ code: customers.code }).from(customers).where(eq(customers.phone, d.phone)).limit(1);
    if (dup) throw new BusinessError(`Un client existe déjà avec ce téléphone (${dup.code}) : recherchez-le.`);
    const code = await nextDocumentNumber(tx, "customer");
    const [first, ...rest] = d.name.split(/\s+/);
    const [c] = await tx
      .insert(customers)
      .values({ code, type: pro ? "professional" : "individual", companyName: pro ? d.name : null, firstName: pro ? null : first, lastName: pro ? null : rest.join(" ") || null, phone: d.phone, address: d.address || null, taxId: d.taxId || null })
      .returning();
    await audit({ userId: me.id, module: "customers", action: "create_pos", entityType: "customer", entityId: c.id, newValues: d }, tx);
    return c;
  }).catch((e) => e as Error);
  if (created instanceof Error) return { ok: false, message: errMsg(created) };
  return { ok: true, customer: { id: created.id, code: created.code, name: d.name, phone: created.phone, pro: false } };
}

/* ─── Paiement complémentaire d'une vente (encaissé dans la caisse ouverte) ── */

export async function posPaymentAction(form: FormData) {
  const orderId = Number(form.get("orderId"));
  const back = `/admin/caisse/ventes/${orderId}`;
  let msg = "";
  try {
    const me = await assertStaff("payments.create");
    if (!me.can("pos.use")) throw new AccessDenied("pos.use");
    const amount = round3(Number(String(form.get("amount") ?? "").replace(",", ".")));
    const method = z.enum(["cash", "card", "transfer", "check"]).parse(form.get("method"));
    const reference = String(form.get("reference") ?? "").slice(0, 80) || null;
    if (!(amount > 0)) throw new BusinessError("Montant invalide.");
    msg = await db.transaction(async (tx) => {
      const [session] = await tx.select().from(cashSessions).where(isNull(cashSessions.closedAt)).limit(1);
      if (!session) throw new BusinessError("Ouvrez la caisse pour encaisser un paiement.");
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!o || o.status === "cancelled") throw new BusinessError("Vente introuvable ou annulée.");
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.orderId, orderId), eq(invoices.kind, "customer"), sql`${invoices.status} <> 'cancelled'`));
      const remaining = round3(inv ? Number(inv.total) - Number(inv.amountPaid) : Number(o.total) - Number(o.amountPaid));
      if (amount > remaining + 0.0005) throw new BusinessError(`Montant supérieur au reste à payer (${remaining.toFixed(3)} DT).`);
      const p = await recordPayment(tx, { direction: "in", method, amount, customerId: o.customerId, orderId, invoiceId: inv?.id ?? null, cashSessionId: session.id, reference, userId: me.id, notes: "Paiement complémentaire" });
      await audit({ userId: me.id, module: "pos", action: "complementary_payment", entityType: "order", entityId: orderId, newValues: { paymentId: p.id, amount, method } }, tx);
      return `Paiement de ${amount.toFixed(3).replace(".", ",")} DT encaissé. Reste à payer : ${round3(remaining - amount).toFixed(3).replace(".", ",")} DT.`;
    });
    revalidatePath("/admin/caisse");
  } catch (e) {
    redirect(`${back}?erreur=${encodeURIComponent(errMsg(e))}`);
  }
  redirect(`${back}?ok=${encodeURIComponent(msg)}`);
}
