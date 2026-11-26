import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { qty, timestamps } from "./_shared";
import { users } from "./auth";
import { products } from "./catalog";
import { warehouses } from "./inventory";

/**
 * Sessions de connexion. L'identifiant est l'empreinte SHA-256 du jeton
 * stocké dans le cookie : une fuite de la base ne permet pas d'usurper une session.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** Paramètres de l'entreprise modifiables depuis le back-office (clé → valeur JSON). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
});

/** Inventaire physique d'un dépôt : comptage puis validation (ajustements tracés). */
export const stockCounts = pgTable(
  "stock_counts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("open"),
    note: text("note"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    closedBy: integer("closed_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [check("stock_counts_status", sql`${t.status} in ('open', 'closed', 'cancelled')`)],
);

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    countId: integer("count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Stock théorique au moment de l'ouverture de l'inventaire. */
    expected: qty("expected").notNull(),
    counted: qty("counted"),
  },
  (t) => [primaryKey({ columns: [t.countId, t.productId] })],
);
