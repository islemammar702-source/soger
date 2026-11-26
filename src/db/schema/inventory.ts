import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { money, qty, timestamps } from "./_shared";
import { users } from "./auth";
import { products } from "./catalog";
import { stockMovementType } from "./enums";

export const warehouses = pgTable(
  "warehouses",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("warehouses_code_uq").on(t.code),
    // Un seul dépôt par défaut.
    uniqueIndex("warehouses_single_default_uq")
      .on(t.isDefault)
      .where(sql`${t.isDefault} = true`),
  ],
);

/**
 * Niveau de stock par produit et par dépôt.
 * NE JAMAIS modifier ces quantités directement : passer par
 * `src/server/inventory` qui écrit le mouvement dans la même transaction.
 */
export const stock = pgTable(
  "stock",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    /** Stock physique présent dans le dépôt. */
    quantityOnHand: qty("quantity_on_hand").notNull().default("0"),
    /** Réservé par des commandes confirmées non encore livrées. */
    quantityReserved: qty("quantity_reserved").notNull().default("0"),
    minQuantity: qty("min_quantity"),
    location: text("location"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.warehouseId] }),
    index("stock_warehouse_idx").on(t.warehouseId),
    check("stock_reserved_non_negative", sql`${t.quantityReserved} >= 0`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    type: stockMovementType("type").notNull(),
    /** Positif = entrée, négatif = sortie. */
    quantity: qty("quantity").notNull(),
    /** Stock physique après le mouvement (lecture d'historique rapide). */
    quantityAfter: qty("quantity_after").notNull(),
    unitCost: money("unit_cost"),
    /** Document à l'origine du mouvement : order, goods_receipt, transfer… */
    referenceType: text("reference_type"),
    referenceId: integer("reference_id"),
    /** Relie les deux lignes d'un transfert entre dépôts. */
    transferGroup: text("transfer_group"),
    note: text("note"),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_movements_product_idx").on(t.productId, t.createdAt),
    index("stock_movements_warehouse_idx").on(t.warehouseId, t.createdAt),
    index("stock_movements_reference_idx").on(t.referenceType, t.referenceId),
    check("stock_movements_non_zero", sql`${t.quantity} <> 0`),
  ],
);
