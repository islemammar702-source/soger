import { pgEnum } from "drizzle-orm/pg-core";

export const userKind = pgEnum("user_kind", ["staff", "customer"]);
export const customerType = pgEnum("customer_type", [
  "individual",
  "professional",
]);
export const priceTier = pgEnum("price_tier", ["retail", "professional"]);
export const sector = pgEnum("sector", ["industrial", "agricultural"]);
export const productStatus = pgEnum("product_status", [
  "draft",
  "published",
  "archived",
]);
export const productRelationKind = pgEnum("product_relation_kind", [
  "equivalent",
  "compatible",
  "similar",
]);

export const stockMovementType = pgEnum("stock_movement_type", [
  "purchase_receipt",
  "sale",
  "customer_return",
  "supplier_return",
  "transfer_in",
  "transfer_out",
  "adjustment",
  "inventory",
  "opening",
]);

export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
]);
export const orderChannel = pgEnum("order_channel", ["online", "store", "quote"]);
export const orderStatus = pgEnum("order_status", [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
]);
export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "partial",
  "paid",
  "refunded",
]);
export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "card",
  "transfer",
  "check",
  "cash_on_delivery",
  "other",
]);
export const paymentDirection = pgEnum("payment_direction", ["in", "out"]);

export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "draft",
  "sent",
  "partially_received",
  "received",
  "cancelled",
]);
export const invoiceKind = pgEnum("invoice_kind", [
  "customer",
  "supplier",
  "credit_note",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
]);
