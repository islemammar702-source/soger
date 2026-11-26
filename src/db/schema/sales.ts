import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { money, qty, rate, timestamps } from "./_shared";
import { users } from "./auth";
import { products } from "./catalog";
import { warehouses } from "./inventory";
import { customers } from "./parties";
import {
  orderChannel,
  orderStatus,
  paymentMethod,
  paymentStatus,
  quoteStatus,
} from "./enums";

/** Totaux communs aux documents commerciaux (HT, remises, TVA, TTC). */
const documentTotals = {
  subtotal: money("subtotal").notNull().default("0"),
  discountTotal: money("discount_total").notNull().default("0"),
  vatTotal: money("vat_total").notNull().default("0"),
  total: money("total").notNull().default("0"),
};

/** Colonnes communes aux lignes de document. */
const lineColumns = {
  productId: integer("product_id").references(() => products.id, {
    onDelete: "restrict",
  }),
  /** Copie figée au moment du document : le produit peut changer ensuite. */
  sku: text("sku"),
  description: text("description").notNull(),
  quantity: qty("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  discountRate: rate("discount_rate").notNull().default("0"),
  vatRate: rate("vat_rate").notNull().default("19.00"),
  /** Total HT de la ligne après remise. */
  lineTotal: money("line_total").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
};

export const quotes = pgTable(
  "quotes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    number: text("number").notNull(),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    /** Demandes de devis web sans compte client. */
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    companyName: text("company_name"),
    status: quoteStatus("status").notNull().default("draft"),
    source: text("source").notNull().default("backoffice"),
    validUntil: date("valid_until"),
    ...documentTotals,
    conditions: text("conditions"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("quotes_number_uq").on(t.number),
    index("quotes_customer_idx").on(t.customerId),
    index("quotes_status_idx").on(t.status, t.createdAt),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    quoteId: integer("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    ...lineColumns,
  },
  (t) => [
    index("quote_items_quote_idx").on(t.quoteId),
    check("quote_items_qty_positive", sql`${t.quantity} > 0`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    number: text("number").notNull(),
    channel: orderChannel("channel").notNull().default("online"),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    quoteId: integer("quote_id").references(() => quotes.id, {
      onDelete: "set null",
    }),
    warehouseId: integer("warehouse_id").references(() => warehouses.id, {
      onDelete: "restrict",
    }),
    status: orderStatus("status").notNull().default("pending"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    paymentMethod: paymentMethod("payment_method"),
    deliveryMethod: text("delivery_method"),
    // Adresse de livraison figée.
    shippingName: text("shipping_name"),
    shippingPhone: text("shipping_phone"),
    shippingAddress: text("shipping_address"),
    shippingCity: text("shipping_city"),
    shippingGovernorate: text("shipping_governorate"),
    shippingPostalCode: text("shipping_postal_code"),
    ...documentTotals,
    shippingTotal: money("shipping_total").notNull().default("0"),
    amountPaid: money("amount_paid").notNull().default("0"),
    notes: text("notes"),
    cashSessionId: integer("cash_session_id"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_number_uq").on(t.number),
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_status_idx").on(t.status, t.createdAt),
    index("orders_channel_created_idx").on(t.channel, t.createdAt),
    check("orders_amount_paid_non_negative", sql`${t.amountPaid} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ...lineColumns,
    /** Coût d'achat figé, pour le calcul de marge. */
    unitCost: money("unit_cost"),
    quantityReturned: qty("quantity_returned").notNull().default("0"),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    check("order_items_qty_positive", sql`${t.quantity} > 0`),
  ],
);
