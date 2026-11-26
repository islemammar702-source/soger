import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  type AnyPgColumn,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { money, qty, rate, timestamps, tsvector } from "./_shared";
import { customers, suppliers } from "./parties";
import { productRelationKind, productStatus, sector } from "./enums";

export const categories = pgTable(
  "categories",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    parentId: integer("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    sector: sector("sector").notNull().default("industrial"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Nom d'icône Lucide utilisé quand il n'y a pas d'image. */
    icon: text("icon"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("categories_slug_uq").on(t.slug),
    index("categories_parent_idx").on(t.parentId),
    index("categories_sector_idx").on(t.sector, t.sortOrder),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    description: text("description"),
    country: text("country"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("brands_slug_uq").on(t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Référence interne SOGER. */
    sku: text("sku").notNull(),
    manufacturerRef: text("manufacturer_ref"),
    barcode: text("barcode"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    brandId: integer("brand_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    unit: text("unit").notNull().default("pièce"),
    purchasePrice: money("purchase_price"),
    salePrice: money("sale_price"),
    proPrice: money("pro_price"),
    vatRate: rate("vat_rate").notNull().default("19.00"),
    minStock: qty("min_stock").notNull().default("0"),
    weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
    status: productStatus("status").notNull().default("draft"),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    isNew: boolean("is_new").notNull().default(false),
    /** Recherche plein texte, maintenue par PostgreSQL. */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('simple', coalesce(${products.sku}, '') || ' ' || coalesce(${products.manufacturerRef}, '') || ' ' || coalesce(${products.barcode}, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(${products.name}, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(${products.shortDescription}, '')), 'C')`,
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_sku_uq").on(t.sku),
    uniqueIndex("products_slug_uq").on(t.slug),
    index("products_barcode_idx").on(t.barcode),
    index("products_manufacturer_ref_idx").on(t.manufacturerRef),
    index("products_category_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brandId),
    index("products_catalog_idx").on(t.status, t.isActive, t.categoryId),
    index("products_search_idx").using("gin", t.searchVector),
    // Recherche approximative (fautes de frappe, références partielles).
    index("products_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
    index("products_sku_trgm_idx").using("gin", sql`lower(${t.sku}) gin_trgm_ops`),
    index("products_mref_trgm_idx").using(
      "gin",
      sql`lower(${t.manufacturerRef}) gin_trgm_ops`,
    ),
    check("products_prices_positive", sql`coalesce(${t.salePrice}, 0) >= 0 and coalesce(${t.proPrice}, 0) >= 0 and coalesce(${t.purchasePrice}, 0) >= 0`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Identifiant Cloudinary, pour suppression / transformations. */
    publicId: text("public_id"),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)],
);

/** Caractéristiques techniques filtrables (diamètre intérieur = 25 mm…). */
export const productAttributes = pgTable(
  "product_attributes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Clé stable pour les filtres, ex. `inner_diameter`. */
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    /** Valeur numérique pour les filtres par plage. */
    numericValue: numeric("numeric_value", { precision: 14, scale: 4 }),
    unit: text("unit"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("product_attributes_product_idx").on(t.productId),
    index("product_attributes_filter_idx").on(t.key, t.value),
    index("product_attributes_numeric_idx").on(t.key, t.numericValue),
  ],
);

export const productEquivalents = pgTable(
  "product_equivalents",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relatedProductId: integer("related_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: productRelationKind("kind").notNull().default("equivalent"),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.relatedProductId, t.kind] }),
    index("product_equivalents_related_idx").on(t.relatedProductId),
    check("product_equivalents_not_self", sql`${t.productId} <> ${t.relatedProductId}`),
  ],
);

export const productSuppliers = pgTable(
  "product_suppliers",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    supplierRef: text("supplier_ref"),
    purchasePrice: money("purchase_price"),
    leadTimeDays: integer("lead_time_days"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.supplierId] }),
    index("product_suppliers_supplier_idx").on(t.supplierId),
  ],
);

/** Prix négociés pour un client précis. */
export const customerPrices = pgTable(
  "customer_prices",
  {
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: money("price").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.customerId, t.productId] })],
);
