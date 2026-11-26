"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { customers, invoices, orders, quoteItems, quotes } from "@/db/schema";
import { documentTotals, fmt3 } from "@/lib/totals";
import { formatTND } from "@/lib/utils";
import { audit } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { documentUrl, sendMail } from "../documents";
import { creditNoteFor, deletePayment, invoiceOrder, recordPayment } from "../finance";
import { notifyUser } from "../notify";
import { BusinessError, cancelOrder, confirmOrder, createOrder, deliverOrder, findOrCreateCustomer, returnOrderItems, setPreparing, setShipped } from "../orders";
import { nextDocumentNumber } from "../sequences";
import { getSettings } from "../settings";
import type { FormState } from "../account-actions";

const back = (path: string, msg: string, ok = true) => redirect(`${path}${path.includes("?") ? "&" : "?"}${ok ? "ok" : "erreur"}=${encodeURIComponent(msg)}`);
const errMsg = (e: unknown) => (e instanceof BusinessError || e instanceof AccessDenied ? e.message : (console.error(e), "Opération impossible."));

/* ─── Devis ────────────────────────────────────────────────────────── */

const lineSchema = z.object({
  productId: z.number().int().positive().nullable(),
  sku: z.string().max(60).nullable(),
  description: z.string().trim().min(1).max(300),
  quantity: z.number().positive().max(1e6),
  unitPrice: z.number().min(0).max(1e9),
  discountRate: z.number().min(0).max(100),
  vatRate: z.number().refine((v) => [0, 7, 13, 19].includes(v), "TVA invalide"),
});

const quoteSchema = z.object({
  id: z.coerce.number().int().optional(),
  customerId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  contactEmail: z.string().trim().max(160).optional(),
  companyName: z.string().trim().max(160).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  conditions: z.string().trim().max(3000).optional(),
  notes: z.string().trim().max(3000).optional(),
  lines: z.string(),
});

export async function saveQuoteAction(_: FormState, form: FormData): Promise<FormState> {
  const id = Number(form.get("id")) || null;
  let me;
  try {
    me = await assertStaff(id ? "quotes.update" : "quotes.create");
  } catch (e) {
    return { status: "error", message: errMsg(e) };
  }
  const parsed = quoteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Données invalides." };
  const d = parsed.data;
  let lines: z.infer<typeof lineSchema>[];
  try {
    lines = z.array(lineSchema).min(1, "Ajoutez au moins une ligne").max(300).parse(JSON.parse(d.lines));
  } catch (e) {
    return { status: "error", message: e instanceof z.ZodError ? e.issues[0]?.message ?? "Lignes invalides" : "Lignes invalides" };
  }
  if (!d.customerId && !d.contactName && !d.companyName) return { status: "error", message: "Choisissez un client ou indiquez un contact." };
  const t = documentTotals(lines);
  const values = {
    customerId: d.customerId ?? null,
    contactName: d.contactName || null,
    contactPhone: d.contactPhone || null,
    contactEmail: d.contactEmail || null,
    companyName: d.companyName || null,
    validUntil: d.validUntil || null,
    conditions: d.conditions || null,
    notes: d.notes || null,
    subtotal: fmt3(t.subtotal),
    discountTotal: fmt3(t.discountTotal),
    vatTotal: fmt3(t.vatTotal),
    total: fmt3(t.total),
  };
  let quoteId = id;
  try {
    await db.transaction(async (tx) => {
      if (id) {
        const [q] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
        if (!q || !["draft", "sent"].includes(q.status)) throw new BusinessError("Seul un devis en brouillon ou envoyé peut être modifié.");
        await tx.update(quotes).set(values).where(eq(quotes.id, id));
        await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
      } else {
        const number = await nextDocumentNumber(tx, "quote");
        const [q] = await tx.insert(quotes).values({ ...values, number, source: "backoffice", createdBy: me.id }).returning({ id: quotes.id });
        quoteId = q.id;
      }
      await tx.insert(quoteItems).values(
        lines.map((l, i) => ({ quoteId: quoteId!, productId: l.productId, sku: l.sku, description: l.description, quantity: String(l.quantity), unitPrice: fmt3(l.unitPrice), discountRate: String(l.discountRate), vatRate: String(l.vatRate), lineTotal: fmt3(t.lines[i].net), sortOrder: i })),
      );
      await audit({ userId: me.id, module: "quotes", action: id ? "update" : "create", entityType: "quote", entityId: quoteId, newValues: { total: values.total, lines: lines.length } }, tx);
    });
  } catch (e) {
    return { status: "error", message: errMsg(e) };
  }
  if (!id) redirect(`/admin/devis/${quoteId}?ok=Devis créé`);
  return { status: "success", message: `Devis enregistré — total ${formatTND(t.total)}.` };
}

export async function quoteStatusAction(form: FormData) {
  const id = Number(form.get("id"));
  const to = z.enum(["sent", "accepted", "rejected", "expired", "draft"]).parse(form.get("to"));
  const path = `/admin/devis/${id}`;
  let msg = "";
  try {
    const me = await assertStaff(to === "sent" ? "quotes.send" : "quotes.update");
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!q) throw new BusinessError("Devis introuvable.");
    if (q.status === "converted") throw new BusinessError("Devis déjà converti en commande.");
    let validUntil = q.validUntil;
    if (to === "sent" && !validUntil) {
      const s = await getSettings();
      validUntil = new Date(Date.now() + s.sales.quoteValidityDays * 86_400_000).toISOString().slice(0, 10);
    }
    await db.transaction(async (tx) => {
      await tx.update(quotes).set({ status: to, validUntil, ...(to === "sent" ? { sentAt: new Date() } : {}), ...(["accepted", "rejected"].includes(to) ? { respondedAt: new Date() } : {}) }).where(eq(quotes.id, id));
      await audit({ userId: me.id, module: "quotes", action: `status_${to}`, entityType: "quote", entityId: id, oldValues: { status: q.status }, newValues: { status: to } }, tx);
      if (to === "sent" && q.customerId) {
        const [c] = await tx.select({ userId: customers.userId }).from(customers).where(eq(customers.id, q.customerId));
        await notifyUser(tx, c?.userId, { type: "quote_sent", title: `Votre devis ${q.number} est disponible`, body: `Montant : ${formatTND(q.total)}`, link: "/compte/devis" });
      }
    });
    msg = "Statut du devis mis à jour.";
  } catch (e) {
    back(path, errMsg(e), false);
  }
  back(path, msg);
}

export async function emailQuoteAction(form: FormData) {
  const id = Number(form.get("id"));
  const path = `/admin/devis/${id}`;
  let msg = "";
  try {
    const me = await assertStaff("quotes.send");
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
    let email = q?.contactEmail;
    if (q?.customerId) email = (await db.select({ e: customers.email }).from(customers).where(eq(customers.id, q.customerId)))[0]?.e ?? email;
    if (!q || !email) throw new BusinessError("Aucune adresse e-mail pour ce devis.");
    const s = await getSettings();
    const url = documentUrl("devis", id);
    const res = await sendMail(email, `Devis ${q.number} — ${s.company.name}`, `<p>Bonjour,</p><p>Veuillez trouver notre devis <strong>${q.number}</strong> d'un montant de <strong>${formatTND(q.total)}</strong> :</p><p><a href="${url}">Consulter et imprimer le devis</a></p><p>Cordialement,<br>${s.company.legalName}</p>`);
    if (!res.sent) throw new BusinessError(res.reason);
    await audit({ userId: me.id, module: "quotes", action: "email", entityType: "quote", entityId: id, newValues: { to: email } });
    if (q.status === "draft") await db.update(quotes).set({ status: "sent", sentAt: new Date() }).where(eq(quotes.id, id));
    msg = `Devis envoyé à ${email}.`;
  } catch (e) {
    back(path, errMsg(e), false);
  }
  back(path, msg);
}

/** Conversion devis → commande, aux prix et remises du devis. */
export async function convertQuoteAction(form: FormData) {
  const id = Number(form.get("id"));
  let orderId = 0;
  try {
    const me = await assertStaff("quotes.convert");
    orderId = await db.transaction(async (tx) => {
      const [q] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
      if (!q || ["converted", "rejected"].includes(q.status)) throw new BusinessError("Ce devis ne peut pas être converti.");
      const items = await tx.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(quoteItems.sortOrder);
      if (items.some((i) => !i.productId)) throw new BusinessError("Toutes les lignes doivent correspondre à un produit du catalogue pour créer une commande.");
      let customer = q.customerId ? (await tx.select().from(customers).where(eq(customers.id, q.customerId)))[0] : null;
      if (!customer) {
        if (!q.contactPhone) throw new BusinessError("Associez un client (ou un téléphone de contact) avant la conversion.");
        customer = await findOrCreateCustomer(tx, { name: q.contactName ?? q.companyName ?? "Client", company: q.companyName, phone: q.contactPhone, email: q.contactEmail });
        await tx.update(quotes).set({ customerId: customer.id }).where(eq(quotes.id, id));
      }
      const order = await createOrder(tx, {
        channel: "quote",
        customer,
        quoteId: id,
        lines: items.map((i) => ({ productId: i.productId!, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountRate: Number(i.discountRate) })),
        notes: `Issu du devis ${q.number}`,
        createdBy: me.id,
      });
      await tx.update(quotes).set({ status: "converted", respondedAt: q.respondedAt ?? new Date() }).where(eq(quotes.id, id));
      await audit({ userId: me.id, module: "quotes", action: "convert", entityType: "quote", entityId: id, newValues: { orderId: order.id, number: order.number } }, tx);
      return order.id;
    });
  } catch (e) {
    back(`/admin/devis/${id}`, errMsg(e), false);
  }
  redirect(`/admin/commandes/${orderId}?ok=${encodeURIComponent("Commande créée à partir du devis")}`);
}

/* ─── Commandes ────────────────────────────────────────────────────── */

const STEP_LABEL: Record<string, string> = { confirm: "confirmée", preparing: "en préparation", ship: "expédiée", deliver: "livrée", cancel: "annulée" };

export async function orderStepAction(form: FormData) {
  const id = Number(form.get("id"));
  const step = z.enum(["confirm", "preparing", "ship", "deliver", "cancel"]).parse(form.get("step"));
  const path = `/admin/commandes/${id}`;
  let msg = "";
  try {
    const me = await assertStaff(step === "cancel" ? "orders.cancel" : "orders.update");
    await db.transaction(async (tx) => {
      const [before] = await tx.select({ status: orders.status, number: orders.number, customerId: orders.customerId }).from(orders).where(eq(orders.id, id));
      if (step === "confirm") await confirmOrder(tx, id);
      if (step === "preparing") await setPreparing(tx, id);
      if (step === "ship") await setShipped(tx, id);
      if (step === "deliver") await deliverOrder(tx, id, me.id);
      if (step === "cancel") await cancelOrder(tx, id);
      await audit({ userId: me.id, module: "orders", action: step, entityType: "order", entityId: id, oldValues: { status: before?.status } }, tx);
      if (before?.customerId) {
        const [c] = await tx.select({ userId: customers.userId }).from(customers).where(eq(customers.id, before.customerId));
        await notifyUser(tx, c?.userId, { type: "order_status", title: `Commande ${before.number} ${STEP_LABEL[step]}`, link: `/compte/commandes/${before.number}` });
      }
    });
    updateTag("products");
    msg = `Commande ${STEP_LABEL[step]}.`;
  } catch (e) {
    back(path, errMsg(e), false);
  }
  back(path, msg);
}

export async function orderReturnAction(form: FormData) {
  const id = Number(form.get("id"));
  const path = `/admin/commandes/${id}`;
  let msg = "";
  try {
    const me = await assertStaff("orders.return");
    const lines = [...form.entries()].filter(([k, v]) => k.startsWith("r_") && Number(v) > 0).map(([k, v]) => ({ itemId: Number(k.slice(2)), quantity: Number(String(v).replace(",", ".")) }));
    const refund = Number(String(form.get("refund") ?? "").replace(",", "."));
    await db.transaction(async (tx) => {
      await returnOrderItems(tx, id, lines, me.id);
      const [o] = await tx.select().from(orders).where(eq(orders.id, id));
      if (refund > 0) {
        await recordPayment(tx, { direction: "out", method: z.enum(["cash", "card", "transfer", "check", "other"]).catch("cash").parse(form.get("method")), amount: refund, customerId: o.customerId, orderId: id, userId: me.id, notes: "Remboursement retour", cashSessionId: Number(form.get("cashSessionId")) || null });
      }
      await audit({ userId: me.id, module: "orders", action: "return", entityType: "order", entityId: id, newValues: { lines, refund } }, tx);
    });
    updateTag("products");
    msg = refund > 0 ? `Retour enregistré et remboursement de ${formatTND(refund)}.` : "Retour enregistré (stock réintégré).";
  } catch (e) {
    back(path, errMsg(e), false);
  }
  back(path, msg);
}

export async function invoiceOrderAction(form: FormData) {
  const id = Number(form.get("id"));
  let invoiceId = 0;
  try {
    const me = await assertStaff("invoices.create");
    const s = await getSettings();
    invoiceId = await db.transaction(async (tx) => {
      const inv = await invoiceOrder(tx, id, { userId: me.id, stampDuty: Number(s.sales.stampDuty) || 0, paymentTermsDays: s.sales.paymentTermsDays });
      await audit({ userId: me.id, module: "invoices", action: "create_from_order", entityType: "invoice", entityId: inv.id, newValues: { number: inv.number, total: inv.total, orderId: id } }, tx);
      const [o] = await tx.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, id));
      const [c] = o?.customerId ? await tx.select({ userId: customers.userId }).from(customers).where(eq(customers.id, o.customerId)) : [];
      await notifyUser(tx, c?.userId, { type: "invoice", title: `Facture ${inv.number} disponible`, link: "/compte/factures" });
      return inv.id;
    });
  } catch (e) {
    back(`/admin/commandes/${id}`, errMsg(e), false);
  }
  redirect(`/admin/factures/${invoiceId}?ok=Facture émise`);
}

/* ─── Paiements ────────────────────────────────────────────────────── */

const paymentSchema = z.object({
  amount: z.string().transform((v) => Number(v.replace(",", "."))).refine((n) => n > 0, "Montant invalide"),
  method: z.enum(["cash", "card", "transfer", "check", "cash_on_delivery", "other"]),
  reference: z.string().trim().max(80).optional(),
  invoiceId: z.coerce.number().int().optional().or(z.literal("").transform(() => undefined)),
  orderId: z.coerce.number().int().optional().or(z.literal("").transform(() => undefined)),
  back: z.string().regex(/^\/admin\/[\w\-/]+$/),
});

export async function addPaymentAction(form: FormData) {
  const raw = Object.fromEntries(form);
  const path = typeof raw.back === "string" && /^\/admin\/[\w\-/]+$/.test(raw.back) ? raw.back : "/admin/paiements";
  let msg = "";
  try {
    const d = paymentSchema.parse(raw);
    const me = await assertStaff("payments.create");
    await db.transaction(async (tx) => {
      let customerId: number | null = null;
      let supplierId: number | null = null;
      let direction: "in" | "out" = "in";
      if (d.invoiceId) {
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, d.invoiceId));
        if (!inv) throw new BusinessError("Facture introuvable.");
        customerId = inv.customerId;
        supplierId = inv.supplierId;
        direction = inv.kind === "supplier" || inv.kind === "credit_note" ? "out" : "in";
      } else if (d.orderId) {
        const [o] = await tx.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, d.orderId));
        customerId = o?.customerId ?? null;
      }
      const p = await recordPayment(tx, { direction, method: d.method, amount: d.amount, customerId, supplierId, invoiceId: d.invoiceId ?? null, orderId: d.orderId ?? null, reference: d.reference, userId: me.id });
      await audit({ userId: me.id, module: "payments", action: "create", entityType: "payment", entityId: p.id, newValues: { amount: p.amount, method: p.method, invoiceId: p.invoiceId, orderId: p.orderId, direction } }, tx);
    });
    msg = `Paiement de ${formatTND(d.amount)} enregistré.`;
  } catch (e) {
    back(path, e instanceof z.ZodError ? "Montant invalide." : errMsg(e), false);
  }
  back(path, msg);
}

export async function deletePaymentAction(form: FormData) {
  const id = Number(form.get("id"));
  const path = String(form.get("back") ?? "/admin/paiements");
  try {
    const me = await assertStaff("payments.delete");
    await db.transaction(async (tx) => {
      const p = await deletePayment(tx, id);
      await audit({ userId: me.id, module: "payments", action: "delete", entityType: "payment", entityId: id, oldValues: p }, tx);
    });
  } catch (e) {
    back(path, errMsg(e), false);
  }
  back(path, "Paiement supprimé.");
}

export async function creditNoteAction(form: FormData) {
  const id = Number(form.get("id"));
  let cnId = 0;
  try {
    const me = await assertStaff("invoices.cancel");
    cnId = await db.transaction(async (tx) => {
      const cn = await creditNoteFor(tx, id, me.id);
      await audit({ userId: me.id, module: "invoices", action: "credit_note", entityType: "invoice", entityId: id, newValues: { creditNote: cn.number } }, tx);
      return cn.id;
    });
  } catch (e) {
    back(`/admin/factures/${id}`, errMsg(e), false);
  }
  redirect(`/admin/factures/${cnId}?ok=Avoir émis`);
}

/** Rattache un client à une commande sans client (vente comptoir) avant facturation. */
export async function setOrderCustomerAction(form: FormData) {
  const id = Number(form.get("id"));
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  try {
    const me = await assertStaff("orders.update");
    const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.code, code));
    if (!c) throw new BusinessError(`Client ${code} introuvable.`);
    await db.update(orders).set({ customerId: c.id }).where(and(eq(orders.id, id)));
    await audit({ userId: me.id, module: "orders", action: "set_customer", entityType: "order", entityId: id, newValues: { customerId: c.id } });
  } catch (e) {
    back(`/admin/commandes/${id}`, errMsg(e), false);
  }
  back(`/admin/commandes/${id}`, "Client associé.");
}
