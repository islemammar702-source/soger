import "server-only";
import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, customers, expenses, invoices, orderItems, orders, payments, products, purchaseOrders, stock } from "@/db/schema";

const SOLD = ["confirmed", "preparing", "shipped", "delivered"] as const;
const tz = sql.raw(`'Africa/Tunis'`);

export type Period = { from: Date; to: Date; fromStr: string; toStr: string };

/** Période [du, au] incluse, par défaut le mois en cours. */
export function parsePeriod(du?: string, au?: string): Period {
  const now = new Date();
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromStr = ok(du) ? du! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const toStr = ok(au) ? au! : now.toISOString().slice(0, 10);
  return { from: new Date(`${fromStr}T00:00:00`), to: new Date(new Date(`${toStr}T00:00:00`).getTime() + 86_400_000), fromStr, toStr };
}

export async function getReport(p: Period) {
  const inPeriod = and(inArray(orders.status, [...SOLD]), gte(orders.createdAt, p.from), lt(orders.createdAt, p.to));
  const days = (p.to.getTime() - p.from.getTime()) / 86_400_000;
  const bucket = days > 62 ? sql`to_char(date_trunc('month', ${orders.createdAt} at time zone ${tz}), 'YYYY-MM')` : sql`to_char((${orders.createdAt} at time zone ${tz})::date, 'YYYY-MM-DD')`;

  const [summary, timeline, byChannel, byCategory, byProduct, byCustomer, payIn, vatOut, vatIn, purchases, exp, aging, valuation] = await Promise.all([
    db
      .select({
        orders: sql<number>`count(*)::int`,
        ttc: sql<string>`coalesce(sum(${orders.total}), 0)`,
        ht: sql<string>`coalesce(sum(${orders.total} - ${orders.vatTotal}), 0)`,
        avg: sql<string>`coalesce(avg(${orders.total}), 0)`,
      })
      .from(orders)
      .where(inPeriod),
    db.select({ k: sql<string>`${bucket}`, ttc: sql<string>`sum(${orders.total})`, n: sql<number>`count(*)::int` }).from(orders).where(inPeriod).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ k: orders.channel, ttc: sql<string>`sum(${orders.total})`, n: sql<number>`count(*)::int` }).from(orders).where(inPeriod).groupBy(orders.channel),
    db
      .select({ k: sql<string>`coalesce(${categories.name}, 'Sans catégorie')`, ht: sql<string>`sum(${orderItems.lineTotal})`, cost: sql<string>`sum(coalesce(${orderItems.unitCost}, 0) * ${orderItems.quantity})` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(products, eq(products.id, orderItems.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(inPeriod)
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`)),
    db
      .select({
        sku: orderItems.sku,
        name: orderItems.description,
        qty: sql<string>`sum(${orderItems.quantity})`,
        ht: sql<string>`sum(${orderItems.lineTotal})`,
        cost: sql<string>`sum(coalesce(${orderItems.unitCost}, 0) * ${orderItems.quantity})`,
        uncosted: sql<number>`count(*) filter (where ${orderItems.unitCost} is null)::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(inPeriod)
      .groupBy(orderItems.sku, orderItems.description)
      .orderBy(desc(sql`sum(${orderItems.lineTotal})`))
      .limit(50),
    db
      .select({ id: customers.id, code: customers.code, name: sql<string>`coalesce(${customers.companyName}, concat_ws(' ', ${customers.firstName}, ${customers.lastName}))`, ttc: sql<string>`sum(${orders.total})`, n: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(inPeriod)
      .groupBy(customers.id)
      .orderBy(desc(sql`sum(${orders.total})`))
      .limit(20),
    db
      .select({ method: payments.method, direction: payments.direction, total: sql<string>`sum(${payments.amount})` })
      .from(payments)
      .where(and(gte(payments.paidAt, p.from), lt(payments.paidAt, p.to)))
      .groupBy(payments.method, payments.direction),
    db
      .select({
        kind: invoices.kind,
        n: sql<number>`count(*)::int`,
        base: sql<string>`coalesce(sum(${invoices.subtotal} - ${invoices.discountTotal}), 0)`,
        vat: sql<string>`coalesce(sum(${invoices.vatTotal}), 0)`,
        stamp: sql<string>`coalesce(sum(${invoices.stampDuty}), 0)`,
        ttc: sql<string>`coalesce(sum(${invoices.total}), 0)`,
      })
      .from(invoices)
      .where(and(inArray(invoices.kind, ["customer", "credit_note"]), sql`${invoices.status} <> 'draft'`, gte(invoices.issueDate, p.fromStr), lte(invoices.issueDate, p.toStr)))
      .groupBy(invoices.kind),
    db
      .select({ vat: sql<string>`coalesce(sum(${invoices.vatTotal}), 0)`, ttc: sql<string>`coalesce(sum(${invoices.total}), 0)`, n: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.kind, "supplier"), sql`${invoices.status} <> 'cancelled'`, gte(invoices.issueDate, p.fromStr), lte(invoices.issueDate, p.toStr))),
    db
      .select({ n: sql<number>`count(*)::int`, ttc: sql<string>`coalesce(sum(${purchaseOrders.total}), 0)` })
      .from(purchaseOrders)
      .where(and(sql`${purchaseOrders.status} <> 'cancelled'`, gte(purchaseOrders.createdAt, p.from), lt(purchaseOrders.createdAt, p.to))),
    db
      .select({ k: expenses.category, total: sql<string>`sum(${expenses.amount})`, vat: sql<string>`sum(${expenses.vatAmount})` })
      .from(expenses)
      .where(and(gte(expenses.paidAt, p.from), lt(expenses.paidAt, p.to)))
      .groupBy(expenses.category)
      .orderBy(desc(sql`2`)),
    db
      .select({
        b0: sql<string>`coalesce(sum(total - amount_paid) filter (where due_date is null or due_date >= current_date), 0)`,
        b30: sql<string>`coalesce(sum(total - amount_paid) filter (where current_date - due_date between 1 and 30), 0)`,
        b60: sql<string>`coalesce(sum(total - amount_paid) filter (where current_date - due_date between 31 and 60), 0)`,
        b90: sql<string>`coalesce(sum(total - amount_paid) filter (where current_date - due_date between 61 and 90), 0)`,
        bOld: sql<string>`coalesce(sum(total - amount_paid) filter (where current_date - due_date > 90), 0)`,
      })
      .from(invoices)
      .where(and(eq(invoices.kind, "customer"), inArray(invoices.status, ["issued", "partially_paid"]))),
    db
      .select({ value: sql<string>`coalesce(sum(${stock.quantityOnHand} * coalesce(${products.purchasePrice}, 0)), 0)`, retail: sql<string>`coalesce(sum(${stock.quantityOnHand} * coalesce(${products.salePrice}, 0)), 0)`, units: sql<string>`coalesce(sum(${stock.quantityOnHand}), 0)` })
      .from(stock)
      .innerJoin(products, eq(products.id, stock.productId)),
  ]);

  const ca = byCategory.reduce((s, c) => s + Number(c.ht), 0);
  const cost = byCategory.reduce((s, c) => s + Number(c.cost), 0);
  const vatInvoices = vatOut.find((v) => v.kind === "customer");
  const vatCredits = vatOut.find((v) => v.kind === "credit_note");
  return {
    summary: { orders: summary[0].orders, ttc: Number(summary[0].ttc), ht: Number(summary[0].ht), avg: Number(summary[0].avg), margin: ca - cost, marginRate: ca > 0 ? (ca - cost) / ca : null },
    timeline: timeline.map((t) => ({ label: t.k.length === 7 ? t.k : `${t.k.slice(8, 10)}/${t.k.slice(5, 7)}`, value: Number(t.ttc), hint: `${t.n} vente(s)` })),
    granularity: days > 62 ? ("mois" as const) : ("jour" as const),
    byChannel: byChannel.map((c) => ({ key: c.k, ttc: Number(c.ttc), n: c.n })),
    byCategory: byCategory.map((c) => ({ label: c.k, ht: Number(c.ht), margin: Number(c.ht) - Number(c.cost) })),
    byProduct: byProduct.map((r) => ({ sku: r.sku, name: r.name, qty: Number(r.qty), ht: Number(r.ht), margin: Number(r.ht) - Number(r.cost), uncosted: r.uncosted > 0 })),
    byCustomer: byCustomer.map((c) => ({ id: c.id, code: c.code, name: c.name, ttc: Number(c.ttc), n: c.n })),
    payments: payIn.map((x) => ({ method: x.method, direction: x.direction, total: Number(x.total) })),
    vat: {
      collected: Number(vatInvoices?.vat ?? 0) - Number(vatCredits?.vat ?? 0),
      base: Number(vatInvoices?.base ?? 0) - Number(vatCredits?.base ?? 0),
      invoices: vatInvoices?.n ?? 0,
      credits: vatCredits?.n ?? 0,
      stamp: Number(vatInvoices?.stamp ?? 0),
      deductible: Number(vatIn[0].vat) + exp.reduce((s, e) => s + Number(e.vat), 0),
    },
    purchases: { n: purchases[0].n, ttc: Number(purchases[0].ttc), supplierInvoices: vatIn[0].n, supplierInvoicesTtc: Number(vatIn[0].ttc) },
    expenses: exp.map((e) => ({ label: e.k, value: Number(e.total) })),
    aging: { current: Number(aging[0].b0), d30: Number(aging[0].b30), d60: Number(aging[0].b60), d90: Number(aging[0].b90), older: Number(aging[0].bOld) },
    valuation: { cost: Number(valuation[0].value), retail: Number(valuation[0].retail), units: Number(valuation[0].units) },
  };
}
