import "server-only";
import { qcol } from "@/db/qcol";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cashRegisters, cashSessions, customers, expenses, invoices, orderItems, orders, payments, users } from "@/db/schema";
import { allReceivables } from "../receivables";
import type { Tx } from "../audit";
import { round3 } from "@/lib/totals";

/**
 * Règles de comptage (jamais de double comptage) :
 * - « Ventes » : une ligne par vente en boutique (commande canal « store ») ; montant = facture si facturée, sinon commande.
 * - « Encaissé » : uniquement les paiements réels enregistrés en caisse (une vente à crédit n'y figure pas ;
 *   un paiement complémentaire y figure le jour où il est encaissé, sans recompter la vente).
 * - « Sorties » : remboursements + dépenses payées depuis la caisse.
 */
const tz = sql.raw(`'Africa/Tunis'`);
const isToday = (col: SQL | unknown) => sql`(${col} at time zone ${tz})::date = (now() at time zone ${tz})::date`;

/** Montant dû et payé d'une vente : la facture fait foi si elle existe (droit de timbre inclus). */
const saleTotal = sql<string>`coalesce(${invoices.total}, ${orders.total})`;
const salePaid = sql<string>`coalesce(${invoices.amountPaid}, ${orders.amountPaid})`;
const invoiceJoin = and(eq(invoices.orderId, orders.id), eq(invoices.kind, "customer"), sql`${invoices.status} <> 'cancelled'`);
const storeSale = and(eq(orders.channel, "store"), sql`${orders.status} <> 'cancelled'`);

/** Espèces attendues = fond de caisse + encaissements espèces − remboursements et dépenses en espèces. */
export async function expectedCash(tx: Tx, sessionId: number) {
  const [s] = await tx.select().from(cashSessions).where(eq(cashSessions.id, sessionId));
  const [{ cin, cout }] = await tx
    .select({
      cin: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.direction} = 'in' and ${payments.method} = 'cash'), 0)`,
      cout: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.direction} = 'out' and ${payments.method} = 'cash'), 0)`,
    })
    .from(payments)
    .where(eq(payments.cashSessionId, sessionId));
  const [{ exp }] = await tx.select({ exp: sql<string>`coalesce(sum(${expenses.amount}), 0)` }).from(expenses).where(and(eq(expenses.cashSessionId, sessionId), eq(expenses.method, "cash")));
  return round3(Number(s.openingAmount) + Number(cin) - Number(cout) - Number(exp));
}

export async function getOpenSession() {
  const [row] = await db
    .select({ s: cashSessions, register: cashRegisters.name, user: users.name })
    .from(cashSessions)
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashSessions.cashRegisterId))
    .leftJoin(users, eq(users.id, cashSessions.openedBy))
    .where(and(isNull(cashSessions.closedAt), eq(cashRegisters.code, "CAISSE1")));
  return row ?? null;
}

export async function getDayStats(sessionId: number | null) {
  const [[sales], [money], [exp], [credit], [globalCredit], byMethod, drawer] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${saleTotal}), 0)` })
      .from(orders)
      .leftJoin(invoices, invoiceJoin)
      .where(and(storeSale, isToday(orders.createdAt))),
    db
      .select({
        cin: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.direction} = 'in'), 0)`,
        cout: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.direction} = 'out'), 0)`,
      })
      .from(payments)
      .where(and(sql`${payments.cashSessionId} is not null`, isToday(payments.paidAt))),
    db.select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` }).from(expenses).where(and(sql`${expenses.cashSessionId} is not null`, isToday(expenses.paidAt))),
    db
      .select({ due: sql<string>`coalesce(sum(greatest(${saleTotal} - ${salePaid}, 0)), 0)`, n: sql<number>`count(*) filter (where ${saleTotal} - ${salePaid} > 0.0005)::int` })
      .from(orders)
      .leftJoin(invoices, invoiceJoin)
      .where(and(storeSale, isToday(orders.createdAt))),
    db.select({ due: allReceivables }).from(sql`(select 1) as one`),
    db
      .select({ method: payments.method, total: sql<string>`sum(${payments.amount})` })
      .from(payments)
      .where(and(eq(payments.direction, "in"), sql`${payments.cashSessionId} is not null`, isToday(payments.paidAt)))
      .groupBy(payments.method),
    sessionId ? expectedCash(db as unknown as Tx, sessionId) : Promise.resolve(null),
  ]);
  return {
    salesCount: sales.n,
    salesTotal: Number(sales.total),
    collected: Number(money.cin),
    outflows: Number(money.cout) + Number(exp.total),
    refunds: Number(money.cout),
    expenses: Number(exp.total),
    creditToday: Number(credit.due),
    creditSales: credit.n,
    creditAll: Number(globalCredit.due),
    byMethod: byMethod.map((m) => ({ method: m.method, total: Number(m.total) })),
    drawer,
  };
}

export type Operation = { at: Date; kind: "sale" | "payment_in" | "payment_out" | "expense"; label: string; ref: string | null; href: string | null; party: string | null; amount: number; method: string | null; user: string | null };

/** Historique des opérations du jour (ventes, encaissements, remboursements, dépenses). */
export async function getDayOperations(): Promise<Operation[]> {
  const partyName = sql<string | null>`coalesce(${customers.companyName}, nullif(concat_ws(' ', ${customers.firstName}, ${customers.lastName}), ''))`;
  const [sales, pays, exps] = await Promise.all([
    db
      .select({ at: orders.createdAt, id: orders.id, number: orders.number, party: partyName, total: saleTotal, paid: salePaid, user: users.name })
      .from(orders)
      .leftJoin(invoices, invoiceJoin)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(users, eq(users.id, orders.createdBy))
      .where(and(storeSale, isToday(orders.createdAt))),
    db
      .select({ at: payments.paidAt, direction: payments.direction, method: payments.method, amount: payments.amount, orderId: payments.orderId, number: orders.number, party: partyName, notes: payments.notes, user: users.name })
      .from(payments)
      .leftJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(customers, eq(customers.id, payments.customerId))
      .leftJoin(users, eq(users.id, payments.recordedBy))
      .where(and(sql`${payments.cashSessionId} is not null`, isToday(payments.paidAt))),
    db
      .select({ at: expenses.paidAt, description: expenses.description, category: expenses.category, amount: expenses.amount, method: expenses.method, user: users.name })
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.createdBy))
      .where(and(sql`${expenses.cashSessionId} is not null`, isToday(expenses.paidAt))),
  ]);
  const ops: Operation[] = [
    ...sales.map((s) => ({
      at: s.at,
      kind: "sale" as const,
      label: Number(s.paid) + 0.0005 < Number(s.total) ? (Number(s.paid) > 0 ? "Vente (paiement partiel)" : "Vente à crédit") : "Vente",
      ref: s.number,
      href: `/admin/caisse/ventes/${s.id}`,
      party: s.party,
      amount: Number(s.total),
      method: null,
      user: s.user,
    })),
    ...pays.map((p) => ({
      at: p.at,
      kind: p.direction === "in" ? ("payment_in" as const) : ("payment_out" as const),
      label: p.direction === "out" ? "Remboursement" : p.notes === "Paiement complémentaire" ? "Paiement complémentaire" : "Encaissement",
      ref: p.number,
      href: p.orderId ? `/admin/caisse/ventes/${p.orderId}` : null,
      party: p.party,
      amount: Number(p.amount),
      method: p.method,
      user: p.user,
    })),
    ...exps.map((e) => ({ at: e.at, kind: "expense" as const, label: `Dépense — ${e.category}`, ref: null, href: "/admin/depenses", party: e.description, amount: Number(e.amount), method: e.method, user: e.user })),
  ];
  return ops.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const SALES_PAGE = 50;

/** Historique des ventes en boutique. */
export async function listStoreSales(f: { q?: string; from?: string; to?: string; filter?: string; page: number }) {
  const conds: (SQL | undefined)[] = [storeSale];
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(orders.number, like), ilike(customers.companyName, like), ilike(customers.lastName, like), ilike(customers.firstName, like), ilike(customers.phone, like)));
  }
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(sql`(${orders.createdAt} at time zone ${tz})::date >= ${f.from}::date`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(sql`(${orders.createdAt} at time zone ${tz})::date <= ${f.to}::date`);
  if (f.filter === "credit") conds.push(sql`${saleTotal} - ${salePaid} > 0.0005`);
  if (f.filter === "soldees") conds.push(sql`${saleTotal} - ${salePaid} <= 0.0005`);
  const where = and(...conds);
  const base = () =>
    db
      .select({
        id: orders.id,
        number: orders.number,
        at: orders.createdAt,
        status: orders.status,
        customerId: orders.customerId,
        party: sql<string | null>`coalesce(${customers.companyName}, nullif(concat_ws(' ', ${customers.firstName}, ${customers.lastName}), ''))`,
        phone: customers.phone,
        items: sql<number>`(select count(*)::int from ${orderItems} oi where oi.order_id = ${qcol(orders.id)})`,
        total: saleTotal,
        paid: salePaid,
        invoiceNumber: invoices.number,
        user: users.name,
      })
      .from(orders)
      .leftJoin(invoices, invoiceJoin)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(users, eq(users.id, orders.createdBy));
  const [rows, [agg]] = await Promise.all([
    base().where(where).orderBy(desc(orders.createdAt)).limit(SALES_PAGE).offset((f.page - 1) * SALES_PAGE),
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${saleTotal}), 0)`, paid: sql<string>`coalesce(sum(${salePaid}), 0)` })
      .from(orders)
      .leftJoin(invoices, invoiceJoin)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(where),
  ]);
  return { rows, total: agg.n, sum: Number(agg.total), paid: Number(agg.paid), pageCount: Math.ceil(agg.n / SALES_PAGE) };
}
