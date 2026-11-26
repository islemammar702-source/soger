import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { money, timestamps } from "./_shared";
import { users } from "./auth";
import { customerType, priceTier } from "./enums";

export const customers = pgTable(
  "customers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Compte web lié (facultatif : un client boutique n'a pas forcément de compte). */
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    code: text("code").notNull(),
    type: customerType("type").notNull().default("individual"),
    priceTier: priceTier("price_tier").notNull().default("retail"),
    companyName: text("company_name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    /** Matricule fiscal (clients professionnels). */
    taxId: text("tax_id"),
    activity: text("activity"),
    address: text("address"),
    city: text("city"),
    governorate: text("governorate"),
    postalCode: text("postal_code"),
    creditLimit: money("credit_limit"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customers_code_uq").on(t.code),
    uniqueIndex("customers_user_uq").on(t.userId),
    index("customers_tax_id_idx").on(t.taxId),
    index("customers_phone_idx").on(t.phone),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    taxId: text("tax_id"),
    address: text("address"),
    city: text("city"),
    country: text("country").notNull().default("Tunisie"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("suppliers_code_uq").on(t.code)],
);
