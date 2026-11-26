import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { favorites, invoices, notifications, orderItems, orders, payments, quoteItems, quotes } from "@/db/schema";

/** Toutes les requêtes sont filtrées par le client connecté : impossible de lire les données d'un autre client. */

export const getMyOrders = (customerId: number) =>
  db
    .select({ id: orders.id, number: orders.number, status: orders.status, paymentStatus: orders.paymentStatus, total: orders.total, createdAt: orders.createdAt, channel: orders.channel, deliveryMethod: orders.deliveryMethod })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(100);

export async function getMyOrder(customerId: number, number: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.customerId, customerId), eq(orders.number, number)));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.sortOrder);
  const invoice = await db.select({ id: invoices.id, number: invoices.number, status: invoices.status }).from(invoices).where(and(eq(invoices.orderId, order.id), eq(invoices.kind, "customer")));
  return { order, items, invoices: invoice };
}

export const getMyQuotes = (customerId: number) =>
  db
    .select({
      id: quotes.id,
      number: quotes.number,
      status: quotes.status,
      total: quotes.total,
      validUntil: quotes.validUntil,
      createdAt: quotes.createdAt,
      lines: sql<number>`(select count(*)::int from ${quoteItems} qi where qi.quote_id = ${quotes.id})`,
    })
    .from(quotes)
    .where(and(eq(quotes.customerId, customerId), inArray(quotes.status, ["sent", "accepted", "rejected", "expired", "converted"])))
    .orderBy(desc(quotes.createdAt))
    .limit(100);

export const getMyInvoices = (customerId: number) =>
  db
    .select({ id: invoices.id, number: invoices.number, kind: invoices.kind, status: invoices.status, total: invoices.total, amountPaid: invoices.amountPaid, issueDate: invoices.issueDate, dueDate: invoices.dueDate })
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), inArray(invoices.status, ["issued", "partially_paid", "paid"])))
    .orderBy(desc(invoices.issueDate))
    .limit(100);

export const getMyPayments = (customerId: number) =>
  db
    .select({ id: payments.id, amount: payments.amount, method: payments.method, paidAt: payments.paidAt, reference: payments.reference, invoiceId: payments.invoiceId })
    .from(payments)
    .where(and(eq(payments.customerId, customerId), eq(payments.direction, "in")))
    .orderBy(desc(payments.paidAt))
    .limit(100);

export async function getMyBalance(customerId: number) {
  const [row] = await db
    .select({
      due: sql<string>`coalesce(sum(case when ${invoices.kind} = 'credit_note' then -(${invoices.total} - ${invoices.amountPaid}) else ${invoices.total} - ${invoices.amountPaid} end), 0)`,
    })
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), inArray(invoices.status, ["issued", "partially_paid"])));
  return Number(row.due);
}

export const getMyFavoriteIds = (userId: number) => db.select({ productId: favorites.productId }).from(favorites).where(eq(favorites.userId, userId));

export const getMyNotifications = (userId: number) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
