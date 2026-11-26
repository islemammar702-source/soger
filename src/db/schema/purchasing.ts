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
import { suppliers } from "./parties";
import { purchaseOrderStatus } from "./enums";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    number: text("number").notNull(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    warehouseId: integer("warehouse_id").references(() => warehouses.id, {
      onDelete: "restrict",
    }),
    status: purchaseOrderStatus("status").notNull().default("draft"),
    expectedAt: date("expected_at"),
    subtotal: money("subtotal").notNull().default("0"),
    vatTotal: money("vat_total").notNull().default("0"),
    total: money("total").notNull().default("0"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("purchase_orders_number_uq").on(t.number),
    index("purchase_orders_supplier_idx").on(t.supplierId, t.createdAt),
    index("purchase_orders_status_idx").on(t.status),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    purchaseOrderId: integer("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    quantityOrdered: qty("quantity_ordered").notNull(),
    quantityReceived: qty("quantity_received").notNull().default("0"),
    unitCost: money("unit_cost").notNull(),
    vatRate: rate("vat_rate").notNull().default("19.00"),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [
    index("purchase_items_po_idx").on(t.purchaseOrderId),
    index("purchase_items_product_idx").on(t.productId),
    check("purchase_items_qty_positive", sql`${t.quantityOrdered} > 0`),
    check(
      "purchase_items_received_bounds",
      sql`${t.quantityReceived} >= 0 and ${t.quantityReceived} <= ${t.quantityOrdered}`,
    ),
  ],
);

/** Bon de réception : une commande fournisseur peut être reçue en plusieurs fois. */
export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    number: text("number").notNull(),
    purchaseOrderId: integer("purchase_order_id").references(
      () => purchaseOrders.id,
      { onDelete: "restrict" },
    ),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    deliveryNoteRef: text("delivery_note_ref"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    receivedBy: integer("received_by").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("goods_receipts_number_uq").on(t.number),
    index("goods_receipts_po_idx").on(t.purchaseOrderId),
  ],
);

export const goodsReceiptItems = pgTable(
  "goods_receipt_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    goodsReceiptId: integer("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    purchaseItemId: integer("purchase_item_id").references(
      () => purchaseItems.id,
      { onDelete: "restrict" },
    ),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost"),
  },
  (t) => [
    index("goods_receipt_items_receipt_idx").on(t.goodsReceiptId),
    check("goods_receipt_items_qty_positive", sql`${t.quantity} > 0`),
  ],
);
