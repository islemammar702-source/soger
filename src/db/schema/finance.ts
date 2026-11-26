import { sql } from "drizzle-orm";
import {
  boolean,
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
import { customers, suppliers } from "./parties";
import { purchaseOrders } from "./purchasing";
import { orders } from "./sales";
import {
  invoiceKind,
  invoiceStatus,
  paymentDirection,
  paymentMethod,
} from "./enums";

export const invoices = pgTable(
  "invoices",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    kind: invoiceKind("kind").notNull().default("customer"),
    /** Numéro SOGER (clients) ou numéro interne (fournisseurs). */
    number: text("number").notNull(),
    /** Numéro porté par la facture du fournisseur. */
    externalRef: text("external_ref"),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    supplierId: integer("supplier_id").references(() => suppliers.id, {
      onDelete: "restrict",
    }),
    orderId: integer("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    purchaseOrderId: integer("purchase_order_id").references(
      () => purchaseOrders.id,
      { onDelete: "restrict" },
    ),
    /** Facture d'origine pour un avoir. */
    creditedInvoiceId: integer("credited_invoice_id"),
    status: invoiceStatus("status").notNull().default("draft"),
    issueDate: date("issue_date").notNull().defaultNow(),
    dueDate: date("due_date"),
    // Instantané des coordonnées client (mentions légales).
    billingName: text("billing_name"),
    billingTaxId: text("billing_tax_id"),
    billingAddress: text("billing_address"),
    subtotal: money("subtotal").notNull().default("0"),
    discountTotal: money("discount_total").notNull().default("0"),
    vatTotal: money("vat_total").notNull().default("0"),
    /** Droit de timbre — montant à faire valider par le comptable. */
    stampDuty: money("stamp_duty").notNull().default("0"),
    total: money("total").notNull().default("0"),
    amountPaid: money("amount_paid").notNull().default("0"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_kind_number_uq").on(t.kind, t.number),
    index("invoices_customer_idx").on(t.customerId, t.issueDate),
    index("invoices_supplier_idx").on(t.supplierId, t.issueDate),
    index("invoices_status_idx").on(t.status, t.dueDate),
    check(
      "invoices_party",
      sql`(${t.kind} = 'supplier' and ${t.supplierId} is not null) or (${t.kind} <> 'supplier' and ${t.customerId} is not null)`,
    ),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    sku: text("sku"),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    discountRate: rate("discount_rate").notNull().default("0"),
    vatRate: rate("vat_rate").notNull().default("19.00"),
    lineTotal: money("line_total").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const cashRegisters = pgTable(
  "cash_registers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    warehouseId: integer("warehouse_id").references(() => warehouses.id, {
      onDelete: "restrict",
    }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("cash_registers_code_uq").on(t.code)],
);

/** Ouverture / clôture de caisse, avec écart de caisse. */
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    cashRegisterId: integer("cash_register_id")
      .notNull()
      .references(() => cashRegisters.id, { onDelete: "restrict" }),
    openedBy: integer("opened_by").references(() => users.id, {
      onDelete: "set null",
    }),
    closedBy: integer("closed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    openingAmount: money("opening_amount").notNull().default("0"),
    expectedAmount: money("expected_amount"),
    countedAmount: money("counted_amount"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    index("cash_sessions_register_idx").on(t.cashRegisterId, t.openedAt),
    // Une seule session ouverte par caisse.
    uniqueIndex("cash_sessions_one_open_uq")
      .on(t.cashRegisterId)
      .where(sql`${t.closedAt} is null`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** in = encaissement client, out = décaissement fournisseur / remboursement. */
    direction: paymentDirection("direction").notNull(),
    method: paymentMethod("method").notNull(),
    amount: money("amount").notNull(),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    supplierId: integer("supplier_id").references(() => suppliers.id, {
      onDelete: "restrict",
    }),
    invoiceId: integer("invoice_id").references(() => invoices.id, {
      onDelete: "restrict",
    }),
    orderId: integer("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id, {
      onDelete: "restrict",
    }),
    /** N° de chèque, de virement, d'autorisation carte… */
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: integer("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("payments_customer_idx").on(t.customerId, t.paidAt),
    index("payments_supplier_idx").on(t.supplierId, t.paidAt),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_order_idx").on(t.orderId),
    index("payments_paid_at_idx").on(t.paidAt),
    check("payments_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    vatAmount: money("vat_amount").notNull().default("0"),
    method: paymentMethod("method").notNull().default("cash"),
    supplierId: integer("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    cashSessionId: integer("cash_session_id").references(() => cashSessions.id, {
      onDelete: "restrict",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("expenses_paid_at_idx").on(t.paidAt),
    check("expenses_amount_positive", sql`${t.amount} > 0`),
  ],
);
