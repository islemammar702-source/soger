import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { invoices, orders } from "@/db/schema";

/**
 * Créances clients = factures non soldées (avoirs en déduction)
 *                  + reste à payer des ventes livrées NON facturées (ventes à crédit en caisse).
 * Une vente facturée n'est comptée qu'une fois : via sa facture.
 */
export const invoiceDueFor = (customerId: SQL | number) =>
  sql<string>`coalesce((select sum(case when i.kind = 'credit_note' then -(i.total - i.amount_paid) else i.total - i.amount_paid end) from ${invoices} i where i.customer_id = ${customerId} and i.kind in ('customer', 'credit_note') and i.status in ('issued', 'partially_paid')), 0)`;

export const orderDueFor = (customerId: SQL | number) =>
  sql<string>`coalesce((select sum(o.total - o.amount_paid) from ${orders} o where o.customer_id = ${customerId} and o.status in ('shipped', 'delivered') and o.amount_paid < o.total and not exists (select 1 from ${invoices} i where i.order_id = o.id and i.kind = 'customer' and i.status <> 'cancelled')), 0)`;

export const customerDueFor = (customerId: SQL | number) => sql<string>`(${invoiceDueFor(customerId)} + ${orderDueFor(customerId)})`;

/** Total des créances, tous clients confondus. */
export const allReceivables = sql<string>`(
  coalesce((select sum(case when i.kind = 'credit_note' then -(i.total - i.amount_paid) else i.total - i.amount_paid end) from ${invoices} i where i.kind in ('customer', 'credit_note') and i.status in ('issued', 'partially_paid')), 0)
  + coalesce((select sum(o.total - o.amount_paid) from ${orders} o where o.status in ('shipped', 'delivered') and o.amount_paid < o.total and not exists (select 1 from ${invoices} i where i.order_id = o.id and i.kind = 'customer' and i.status <> 'cancelled')), 0)
)`;
