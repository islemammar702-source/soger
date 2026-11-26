import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { customers, invoiceItems, invoices, orderItems, orders, payments, suppliers } from "@/db/schema";
import { documentTotals, fmt3, round3 } from "@/lib/totals";
import type { Tx } from "./audit";
import { BusinessError } from "./orders";
import { nextDocumentNumber } from "./sequences";

type Method = "cash" | "card" | "transfer" | "check" | "cash_on_delivery" | "other";

/** Met à jour montant payé + statut d'une facture à partir de ses paiements. */
async function refreshInvoice(tx: Tx, invoiceId: number) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
  if (!inv) return;
  const [{ paid }] = await tx
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  const p = round3(Number(paid));
  const total = Number(inv.total);
  const status = inv.status === "cancelled" || inv.status === "draft" ? inv.status : p >= total - 0.0005 ? "paid" : p > 0 ? "partially_paid" : "issued";
  await tx.update(invoices).set({ amountPaid: fmt3(p), status }).where(eq(invoices.id, invoiceId));
}

/** Met à jour montant payé + statut de paiement d'une commande. */
async function refreshOrder(tx: Tx, orderId: number) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) return;
  const [{ inSum, outSum }] = await tx
    .select({
      inSum: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.direction} = 'in'), 0)`,
      outSum: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.direction} = 'out'), 0)`,
    })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  const paid = round3(Number(inSum) - Number(outSum));
  const total = Number(o.total);
  const paymentStatus = Number(outSum) > 0 && paid <= 0 ? "refunded" : paid >= total - 0.0005 ? "paid" : paid > 0 ? "partial" : "unpaid";
  await tx.update(orders).set({ amountPaid: fmt3(Math.max(0, paid)), paymentStatus }).where(eq(orders.id, orderId));
}

/**
 * Enregistre un paiement (encaissement client ou décaissement fournisseur / remboursement)
 * et répercute immédiatement sur la facture et la commande liées.
 */
export async function recordPayment(
  tx: Tx,
  p: {
    direction: "in" | "out";
    method: Method;
    amount: number;
    customerId?: number | null;
    supplierId?: number | null;
    invoiceId?: number | null;
    orderId?: number | null;
    cashSessionId?: number | null;
    reference?: string | null;
    notes?: string | null;
    userId: number | null;
  },
) {
  const amount = round3(p.amount);
  if (!(amount > 0)) throw new BusinessError("Le montant doit être positif.");
  let orderId = p.orderId ?? null;
  if (p.invoiceId) {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, p.invoiceId));
    if (!inv) throw new BusinessError("Facture introuvable.");
    if (inv.status === "cancelled" || inv.status === "draft") throw new BusinessError("Impossible d'encaisser une facture annulée ou en brouillon.");
    if (inv.kind === "credit_note" && inv.status === "paid") throw new BusinessError("Cet avoir est déjà soldé.");
    const remaining = round3(Number(inv.total) - Number(inv.amountPaid));
    if (inv.kind !== "credit_note" && amount > remaining + 0.0005) throw new BusinessError(`Montant supérieur au reste à payer (${remaining.toFixed(3)} DT).`);
    orderId = orderId ?? inv.orderId;
  }
  const [row] = await tx
    .insert(payments)
    .values({
      direction: p.direction,
      method: p.method,
      amount: fmt3(amount),
      customerId: p.customerId ?? null,
      supplierId: p.supplierId ?? null,
      invoiceId: p.invoiceId ?? null,
      orderId,
      cashSessionId: p.cashSessionId ?? null,
      reference: p.reference || null,
      notes: p.notes || null,
      recordedBy: p.userId,
    })
    .returning();
  if (p.invoiceId) await refreshInvoice(tx, p.invoiceId);
  if (orderId) await refreshOrder(tx, orderId);
  return row;
}

/** Annule un paiement saisi par erreur (suppression tracée par le journal). */
export async function deletePayment(tx: Tx, id: number) {
  const [p] = await tx.select().from(payments).where(eq(payments.id, id));
  if (!p) throw new BusinessError("Paiement introuvable.");
  await tx.delete(payments).where(eq(payments.id, id));
  if (p.invoiceId) await refreshInvoice(tx, p.invoiceId);
  if (p.orderId) await refreshOrder(tx, p.orderId);
  return p;
}

/** Facture client à partir d'une commande (numérotation continue, droit de timbre, échéance). */
export async function invoiceOrder(tx: Tx, orderId: number, opts: { userId: number | null; stampDuty: number; paymentTermsDays: number }) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) throw new BusinessError("Commande introuvable.");
  if (o.status === "cancelled") throw new BusinessError("Commande annulée : facturation impossible.");
  if (!o.customerId) throw new BusinessError("Associez un client à la commande avant de facturer.");
  const [existing] = await tx.select({ id: invoices.id, number: invoices.number }).from(invoices).where(and(eq(invoices.orderId, orderId), eq(invoices.kind, "customer"), sql`${invoices.status} <> 'cancelled'`));
  if (existing) throw new BusinessError(`Cette commande est déjà facturée (${existing.number}).`);
  const [c] = await tx.select().from(customers).where(eq(customers.id, o.customerId));
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.sortOrder);
  const lines = items.map((i) => ({ quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountRate: Number(i.discountRate), vatRate: Number(i.vatRate) }));
  const shipping = Number(o.shippingTotal);
  const t = documentTotals(lines, { shipping, shippingVatRate: shipping ? 19 : 0, stampDuty: opts.stampDuty });
  const number = await nextDocumentNumber(tx, "invoice");
  const today = new Date();
  const due = new Date(today.getTime() + opts.paymentTermsDays * 86_400_000);
  const [inv] = await tx
    .insert(invoices)
    .values({
      kind: "customer",
      number,
      customerId: o.customerId,
      orderId,
      status: "issued",
      issueDate: today.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      billingName: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" "),
      billingTaxId: c.taxId,
      billingAddress: [c.address, c.postalCode, c.city, c.governorate].filter(Boolean).join(", ") || null,
      subtotal: fmt3(t.subtotal),
      discountTotal: fmt3(t.discountTotal),
      vatTotal: fmt3(t.vatTotal),
      stampDuty: fmt3(t.stampDuty),
      total: fmt3(t.total),
      createdBy: opts.userId,
      issuedAt: today,
    })
    .returning();
  await tx.insert(invoiceItems).values([
    ...items.map((i, k) => ({ invoiceId: inv.id, productId: i.productId, sku: i.sku, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discountRate: i.discountRate, vatRate: i.vatRate, lineTotal: fmt3(t.lines[k].net), sortOrder: k })),
    ...(shipping ? [{ invoiceId: inv.id, productId: null, sku: null, description: "Frais de livraison", quantity: "1", unitPrice: fmt3(shipping), discountRate: "0", vatRate: "19.00", lineTotal: fmt3(shipping), sortOrder: items.length }] : []),
  ]);
  // Les paiements déjà reçus sur la commande sont rattachés à la facture.
  await tx.update(payments).set({ invoiceId: inv.id }).where(and(eq(payments.orderId, orderId), sql`${payments.invoiceId} is null`, eq(payments.direction, "in")));
  await refreshInvoice(tx, inv.id);
  return inv;
}

/**
 * Avoir : annulation comptable totale d'une facture client (la facture d'origine est conservée).
 * - Facture jamais payée : elle est annulée et l'avoir est soldé d'office (rien à rembourser).
 * - Facture (partiellement) payée : la facture reste telle quelle et l'avoir vient en déduction ;
 *   le solde client devient négatif du montant déjà payé (à rembourser).
 * Ainsi l'avoir n'est jamais déduit deux fois du solde du client.
 */
export async function creditNoteFor(tx: Tx, invoiceId: number, userId: number | null) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
  if (!inv || inv.kind !== "customer") throw new BusinessError("Facture client introuvable.");
  const [already] = await tx.select({ number: invoices.number }).from(invoices).where(and(eq(invoices.creditedInvoiceId, invoiceId), eq(invoices.kind, "credit_note")));
  if (already) throw new BusinessError(`Un avoir existe déjà (${already.number}).`);
  const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  const number = await nextDocumentNumber(tx, "credit_note");
  const neverPaid = Number(inv.amountPaid) <= 0;
  const [cn] = await tx
    .insert(invoices)
    .values({
      kind: "credit_note",
      number,
      customerId: inv.customerId,
      orderId: inv.orderId,
      creditedInvoiceId: inv.id,
      status: neverPaid ? "paid" : "issued",
      issueDate: new Date().toISOString().slice(0, 10),
      billingName: inv.billingName,
      billingTaxId: inv.billingTaxId,
      billingAddress: inv.billingAddress,
      subtotal: inv.subtotal,
      discountTotal: inv.discountTotal,
      vatTotal: inv.vatTotal,
      stampDuty: inv.stampDuty,
      total: inv.total,
      amountPaid: neverPaid ? inv.total : "0",
      notes: `Avoir sur facture ${inv.number}`,
      createdBy: userId,
      issuedAt: new Date(),
    })
    .returning();
  if (items.length)
    await tx.insert(invoiceItems).values(
      items.map((i) => ({ invoiceId: cn.id, productId: i.productId, sku: i.sku, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discountRate: i.discountRate, vatRate: i.vatRate, lineTotal: i.lineTotal, sortOrder: i.sortOrder })),
    );
  if (neverPaid) await tx.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, invoiceId));
  return cn;
}

/** Facture fournisseur saisie (montants de la facture reçue). */
export async function recordSupplierInvoice(
  tx: Tx,
  d: { supplierId: number; purchaseOrderId?: number | null; externalRef: string; issueDate: string; dueDate?: string | null; subtotal: number; vatTotal: number; stampDuty: number; userId: number | null; notes?: string | null },
) {
  const [s] = await tx.select().from(suppliers).where(eq(suppliers.id, d.supplierId));
  if (!s) throw new BusinessError("Fournisseur introuvable.");
  const number = await nextDocumentNumber(tx, "supplier_invoice");
  const [inv] = await tx
    .insert(invoices)
    .values({
      kind: "supplier",
      number,
      externalRef: d.externalRef,
      supplierId: d.supplierId,
      purchaseOrderId: d.purchaseOrderId ?? null,
      status: "issued",
      issueDate: d.issueDate,
      dueDate: d.dueDate || new Date(new Date(d.issueDate).getTime() + s.paymentTermsDays * 86_400_000).toISOString().slice(0, 10),
      billingName: s.name,
      billingTaxId: s.taxId,
      subtotal: fmt3(d.subtotal),
      vatTotal: fmt3(d.vatTotal),
      stampDuty: fmt3(d.stampDuty),
      total: fmt3(d.subtotal + d.vatTotal + d.stampDuty),
      notes: d.notes ?? null,
      createdBy: d.userId,
      issuedAt: new Date(),
    })
    .returning();
  return inv;
}
