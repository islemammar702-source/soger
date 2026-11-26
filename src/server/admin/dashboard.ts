import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { allReceivables } from "../receivables";
import { categories, invoices, orderItems, orders, products, quotes, stock } from "@/db/schema";

/**
 * Indicateurs calculés sur les données réelles.
 * « Ventes » = commandes confirmées, en préparation, expédiées ou livrées (hors en attente / annulées).
 * Dates en heure de Tunis.
 */
const TZ = "Africa/Tunis";
const SOLD = ["confirmed", "preparing", "shipped", "delivered"] as const;
// Fuseau en constante SQL (et non en paramètre) : sinon PostgreSQL refuse le GROUP BY.
const tz = sql.raw(`'${TZ}'`);
const localDay = sql`(${orders.createdAt} at time zone ${tz})::date`;
const soldWhere = inArray(orders.status, [...SOLD]);

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

async function salesBetween(start: Date, end: Date) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${orders.total}), 0)`, count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(soldWhere, gte(orders.createdAt, start), lt(orders.createdAt, end)));
  return { total: Number(row.total), count: row.count };
}

async function marginBetween(start: Date, end: Date) {
  const [row] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)`,
      cost: sql<string>`coalesce(sum(${orderItems.unitCost} * ${orderItems.quantity}), 0)`,
      uncosted: sql<number>`count(*) filter (where ${orderItems.unitCost} is null)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(soldWhere, gte(orders.createdAt, start), lt(orders.createdAt, end)));
  const revenue = Number(row.revenue);
  const cost = Number(row.cost);
  return { revenue, margin: revenue - cost, rate: revenue > 0 ? (revenue - cost) / revenue : null, uncosted: row.uncosted };
}

export async function getDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const month = monthBounds(0);
  const prevMonth = monthBounds(-1);
  const since30 = new Date(today.getTime() - 29 * 86_400_000);
  const since12m = monthBounds(-11).start;

  const [day, monthSales, prevSales, margin, pendingOrders, pendingQuotes, receivables, debts, lowStock, daily, monthly, byCategory, topProducts] = await Promise.all([
    salesBetween(today, tomorrow),
    salesBetween(month.start, month.end),
    salesBetween(prevMonth.start, prevMonth.end),
    marginBetween(month.start, month.end),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.status, "pending")),
    db.select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${quotes.total}),0)` }).from(quotes).where(inArray(quotes.status, ["draft", "sent"])),
    db
      .select({ due: allReceivables, n: sql<number>`(select count(*)::int from ${invoices} where kind = 'customer' and status in ('issued','partially_paid'))` })
      .from(sql`(select 1) as one`),
    db
      .select({ due: sql<string>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}), 0)`, n: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.kind, "supplier"), inArray(invoices.status, ["issued", "partially_paid"]))),
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        minStock: products.minStock,
        available: sql<string>`coalesce(sum(${stock.quantityOnHand} - ${stock.quantityReserved}), 0)`,
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(and(eq(products.isActive, true), sql`${products.status} <> 'archived'`))
      .groupBy(products.id)
      .having(sql`coalesce(sum(${stock.quantityOnHand} - ${stock.quantityReserved}), 0) <= ${products.minStock}`)
      .orderBy(sql`coalesce(sum(${stock.quantityOnHand} - ${stock.quantityReserved}), 0)`)
      .limit(50),
    db
      .select({ day: sql<string>`${localDay}::text`, total: sql<string>`sum(${orders.total})` })
      .from(orders)
      .where(and(soldWhere, gte(orders.createdAt, since30)))
      .groupBy(localDay),
    db
      .select({ month: sql<string>`to_char(date_trunc('month', ${orders.createdAt} at time zone ${tz}), 'YYYY-MM')`, total: sql<string>`sum(${orders.total})` })
      .from(orders)
      .where(and(soldWhere, gte(orders.createdAt, since12m)))
      .groupBy(sql`1`),
    db
      .select({ name: sql<string>`coalesce(${categories.name}, 'Sans catégorie')`, total: sql<string>`sum(${orderItems.lineTotal})` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(products, eq(products.id, orderItems.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(soldWhere, gte(orders.createdAt, month.start)))
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`))
      .limit(8),
    db
      .select({ name: orderItems.description, sku: orderItems.sku, qty: sql<string>`sum(${orderItems.quantity})`, total: sql<string>`sum(${orderItems.lineTotal})` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(soldWhere, gte(orders.createdAt, month.start)))
      .groupBy(orderItems.description, orderItems.sku)
      .orderBy(desc(sql`sum(${orderItems.lineTotal})`))
      .limit(6),
  ]);

  // Séries complètes (jours / mois sans vente = 0).
  const dayMap = new Map(daily.map((d) => [d.day, Number(d.total)]));
  const dailySeries = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(since30.getTime() + i * 86_400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, value: dayMap.get(key) ?? 0 };
  });
  const monthMap = new Map(monthly.map((m) => [m.month, Number(m.total)]));
  const monthNames = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const monthlySeries = Array.from({ length: 12 }, (_, i) => {
    const d = monthBounds(i - 11).start;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { label: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, value: monthMap.get(key) ?? 0 };
  });

  const out = lowStock.filter((p) => Number(p.available) <= 0);
  return {
    day,
    month: monthSales,
    prevMonth: prevSales,
    growth: prevSales.total > 0 ? (monthSales.total - prevSales.total) / prevSales.total : null,
    margin,
    pendingOrders: pendingOrders[0].n,
    pendingQuotes: { count: pendingQuotes[0].n, total: Number(pendingQuotes[0].total) },
    receivables: { due: Number(receivables[0].due), count: receivables[0].n },
    debts: { due: Number(debts[0].due), count: debts[0].n },
    lowStock: lowStock.filter((p) => Number(p.available) > 0),
    outOfStock: out,
    dailySeries,
    monthlySeries,
    byCategory: byCategory.map((c) => ({ label: c.name, value: Number(c.total) })),
    topProducts: topProducts.map((p) => ({ label: p.name, value: Number(p.total), hint: `${Number(p.qty)} vendu(s) · ${p.sku ?? ""}` })),
  };
}
