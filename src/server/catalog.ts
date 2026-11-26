import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import type { SORT_KEYS } from "@/lib/catalog-sorts";
import { brands, categories, productAttributes, productEquivalents, productImages, products, stock } from "@/db/schema";

export type Sector = "industrial" | "agricultural";

export async function getCategories(sector?: Sector) {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      icon: categories.icon,
      imageUrl: categories.imageUrl,
      sector: categories.sector,
      productCount: sql<number>`(select count(*)::int from ${products} p where p.category_id = ${categories.id} and p.status = 'published' and p.is_active)`,
    })
    .from(categories)
    .where(and(eq(categories.isActive, true), sector ? eq(categories.sector, sector) : undefined))
    .orderBy(asc(categories.sector), asc(categories.sortOrder));
}

export async function getCategory(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isActive, true)));
  return row ?? null;
}

export async function getBrands() {
  "use cache";
  cacheLife("hours");
  cacheTag("brands");
  return db
    .select({ id: brands.id, slug: brands.slug, name: brands.name, logoUrl: brands.logoUrl, country: brands.country })
    .from(brands)
    .where(eq(brands.isActive, true))
    .orderBy(asc(brands.sortOrder), asc(brands.name));
}

/* ─── Produits ─────────────────────────────────────────────────────── */

const available = sql<string>`coalesce((select sum(s.quantity_on_hand - s.quantity_reserved) from ${stock} s where s.product_id = ${products.id}), 0)`;

const cardColumns = {
  id: products.id,
  slug: products.slug,
  sku: products.sku,
  manufacturerRef: products.manufacturerRef,
  name: products.name,
  shortDescription: products.shortDescription,
  salePrice: products.salePrice,
  vatRate: products.vatRate,
  minStock: products.minStock,
  unit: products.unit,
  isNew: products.isNew,
  brandName: brands.name,
  brandSlug: brands.slug,
  categorySlug: categories.slug,
  categoryName: categories.name,
  available,
  imageUrl: sql<string | null>`(select i.url from ${productImages} i where i.product_id = ${products.id} order by i.is_primary desc, i.sort_order limit 1)`,
};

export type ProductCardData = Awaited<ReturnType<typeof getFeaturedProducts>>[number];

const visible = and(eq(products.status, "published"), eq(products.isActive, true));

function cardQuery() {
  return db
    .select(cardColumns)
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(categories, eq(categories.id, products.categoryId));
}

export async function getFeaturedProducts(limit = 8, sector: Sector = "industrial") {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  return cardQuery()
    .where(and(visible, eq(products.isFeatured, true), eq(categories.sector, sector)))
    .orderBy(desc(products.updatedAt))
    .limit(limit);
}

export async function getNewProducts(limit = 4) {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  return cardQuery()
    .where(and(visible, eq(products.isNew, true)))
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

export async function getProductsBySector(sector: Sector, limit = 8) {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  return cardQuery()
    .where(and(visible, eq(categories.sector, sector)))
    .orderBy(desc(products.isFeatured), asc(products.name))
    .limit(limit);
}

export const PAGE_SIZE = 24;

export type SortKey = (typeof SORT_KEYS)[number];

export type CatalogFilters = {
  categorySlug?: string;
  q?: string;
  /** Slugs de marques (plusieurs possibles). */
  brands?: string[];
  /** Bornes de prix TTC en dinars. */
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  /** Plages sur les caractéristiques numériques : { inner_diameter: [20, 30] }. */
  attrs?: Record<string, [number | null, number | null]>;
  sort?: SortKey;
  page?: number;
};

const priceTTC = sql`(${products.salePrice} * (1 + ${products.vatRate} / 100))`;
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Conditions communes (visibilité, catégorie, recherche). `null` = catégorie inconnue. */
async function baseConditions(f: Pick<CatalogFilters, "categorySlug" | "q">) {
  const conds: SQL[] = [visible!];
  if (f.categorySlug) {
    const cat = await getCategory(f.categorySlug);
    if (!cat) return null;
    conds.push(eq(products.categoryId, cat.id));
  }
  const q = f.q?.trim().slice(0, 100);
  if (q) conds.push(searchCondition(q));
  return conds;
}

/**
 * Recherche par référence SOGER, référence fabricant, code-barres, nom, marque
 * et caractéristiques. Plein texte + trigrammes : tolère les fautes de frappe.
 */
function searchCondition(q: string) {
  const lq = q.toLowerCase();
  const like = `%${escapeLike(lq)}%`;
  const brandIds = db.select({ id: brands.id }).from(brands).where(ilike(brands.name, `%${escapeLike(q)}%`));
  const attrMatch = db
    .select({ id: productAttributes.productId })
    .from(productAttributes)
    .where(sql`lower(${productAttributes.value}) = ${lq}`);
  return or(
    sql`${products.searchVector} @@ plainto_tsquery('simple', ${q})`,
    sql`lower(${products.sku}) like ${like}`,
    sql`lower(${products.manufacturerRef}) like ${like}`,
    eq(products.barcode, q),
    sql`lower(${products.name}) % ${lq}`,
    sql`word_similarity(${lq}, lower(${products.name})) > 0.45`,
    inArray(products.brandId, brandIds),
    inArray(products.id, attrMatch),
  )!;
}

function searchRank(q: string) {
  const lq = q.toLowerCase();
  return sql`greatest(similarity(lower(${products.name}), ${lq}), similarity(lower(${products.sku}), ${lq}), similarity(lower(coalesce(${products.manufacturerRef}, '')), ${lq}), ts_rank(${products.searchVector}, plainto_tsquery('simple', ${q})))`;
}

/** Liste paginée côté serveur, avec filtres et tri. */
export async function listProducts(f: CatalogFilters) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  const page = Math.max(1, Math.floor(f.page ?? 1));
  const conds = await baseConditions(f);
  if (!conds) return { items: [], total: 0, page, pageCount: 0 };

  if (f.brands?.length) {
    conds.push(inArray(products.brandId, db.select({ id: brands.id }).from(brands).where(inArray(brands.slug, f.brands))));
  }
  if (f.priceMin != null) conds.push(sql`${priceTTC} >= ${f.priceMin}`);
  if (f.priceMax != null) conds.push(sql`${priceTTC} <= ${f.priceMax}`);
  if (f.inStock) conds.push(sql`${available} > 0`);
  for (const [key, [min, max]] of Object.entries(f.attrs ?? {})) {
    conds.push(sql`exists (select 1 from ${productAttributes} a where a.product_id = ${products.id} and a.key = ${key}
      ${min != null ? sql`and a.numeric_value >= ${min}` : sql``}
      ${max != null ? sql`and a.numeric_value <= ${max}` : sql``})`);
  }

  const q = f.q?.trim().slice(0, 100);
  const sort: SortKey = f.sort ?? (q ? "pertinence" : "nom");
  const order: SQL[] = {
    pertinence: q ? [desc(searchRank(q)), desc(products.isFeatured), asc(products.name)] : [desc(products.isFeatured), asc(products.name)],
    "prix-asc": [sql`${products.salePrice} asc nulls last`, asc(products.name)],
    "prix-desc": [sql`${products.salePrice} desc nulls last`, asc(products.name)],
    nom: [asc(products.name)],
    nouveautes: [desc(products.isNew), desc(products.createdAt)],
  }[sort];

  const where = and(...conds);
  const [items, [{ total }]] = await Promise.all([
    cardQuery().where(where).orderBy(...order).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return { items, total, page, pageCount: Math.ceil(total / PAGE_SIZE) };
}

/**
 * Valeurs disponibles pour les filtres, calculées sur la catégorie / recherche
 * courante (sans les autres filtres, pour pouvoir élargir la sélection).
 */
export async function getCatalogFacets(f: Pick<CatalogFilters, "categorySlug" | "q">) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  const conds = await baseConditions(f);
  if (!conds) return { brands: [], price: null, attributes: [] };
  const where = and(...conds);
  const ids = db.select({ id: products.id }).from(products).where(where);

  const [brandRows, [price], attributes] = await Promise.all([
    db
      .select({ slug: brands.slug, name: brands.name, count: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(brands, eq(brands.id, products.brandId))
      .where(where)
      .groupBy(brands.slug, brands.name)
      .orderBy(asc(brands.name)),
    db
      .select({ min: sql<string | null>`floor(min(${priceTTC}))`, max: sql<string | null>`ceil(max(${priceTTC}))` })
      .from(products)
      .where(where),
    db
      .select({
        key: productAttributes.key,
        label: sql<string>`min(${productAttributes.label})`,
        unit: sql<string | null>`min(${productAttributes.unit})`,
        min: sql<string>`min(${productAttributes.numericValue})`,
        max: sql<string>`max(${productAttributes.numericValue})`,
        count: sql<number>`count(distinct ${productAttributes.productId})::int`,
      })
      .from(productAttributes)
      .where(and(inArray(productAttributes.productId, ids), sql`${productAttributes.numericValue} is not null`))
      .groupBy(productAttributes.key)
      .having(sql`count(distinct ${productAttributes.productId}) >= 2 and min(${productAttributes.numericValue}) < max(${productAttributes.numericValue})`)
      .orderBy(sql`count(distinct ${productAttributes.productId}) desc`)
      .limit(6),
  ]);

  return {
    brands: brandRows,
    price: price.min != null && price.max != null && Number(price.min) < Number(price.max) ? { min: Number(price.min), max: Number(price.max) } : null,
    attributes: attributes.map((a) => ({ ...a, min: Number(a.min), max: Number(a.max) })),
  };
}

/* ─── Suggestions de recherche (saisie semi-automatique) ─────────────── */

export async function getSearchSuggestions(rawQ: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const q = rawQ.trim().slice(0, 60);
  if (q.length < 2) return { products: [], categories: [], brands: [] };
  const lq = q.toLowerCase();
  const like = `%${escapeLike(lq)}%`;

  const [productRows, categoryRows, brandRows] = await Promise.all([
    db
      .select({ slug: products.slug, sku: products.sku, name: products.name, manufacturerRef: products.manufacturerRef, brandName: brands.name, salePrice: products.salePrice, vatRate: products.vatRate })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(visible, searchCondition(q)))
      .orderBy(desc(searchRank(q)), asc(products.name))
      .limit(6),
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .where(and(eq(categories.isActive, true), or(sql`lower(${categories.name}) like ${like}`, sql`lower(${categories.name}) % ${lq}`)))
      .limit(3),
    db
      .select({ slug: brands.slug, name: brands.name })
      .from(brands)
      .where(and(eq(brands.isActive, true), sql`lower(${brands.name}) like ${like}`))
      .limit(3),
  ]);
  return { products: productRows, categories: categoryRows, brands: brandRows };
}

/* ─── Fiche produit ────────────────────────────────────────────────── */

export async function getProduct(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `product:${slug}`);
  const [p] = await cardQuery().where(and(visible, eq(products.slug, slug)));
  if (!p) return null;
  const [detail] = await db
    .select({ description: products.description, categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, p.id));

  // Relations dans les deux sens : A équivalent à B ⇔ B équivalent à A.
  const relations = await db
    .select({ id: productEquivalents.relatedProductId, kind: productEquivalents.kind })
    .from(productEquivalents)
    .where(eq(productEquivalents.productId, p.id))
    .union(
      db
        .select({ id: productEquivalents.productId, kind: productEquivalents.kind })
        .from(productEquivalents)
        .where(eq(productEquivalents.relatedProductId, p.id)),
    );
  const relatedIds = relations.map((r) => r.id);

  const [attributes, images, linked, similar] = await Promise.all([
    db.select({ key: productAttributes.key, label: productAttributes.label, value: productAttributes.value, unit: productAttributes.unit })
      .from(productAttributes).where(eq(productAttributes.productId, p.id)).orderBy(asc(productAttributes.sortOrder)),
    db.select({ url: productImages.url, alt: productImages.alt })
      .from(productImages).where(eq(productImages.productId, p.id)).orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder)),
    relatedIds.length ? cardQuery().where(and(visible, inArray(products.id, relatedIds))) : Promise.resolve([]),
    detail.categoryId
      ? cardQuery()
          .where(and(visible, eq(products.categoryId, detail.categoryId), sql`${products.id} <> ${p.id}`, relatedIds.length ? sql`${products.id} not in (${sql.join(relatedIds.map((id) => sql`${id}`), sql`, `)})` : undefined))
          .orderBy(desc(products.isFeatured), asc(products.name))
          .limit(4)
      : Promise.resolve([]),
  ]);

  const kindOf = new Map(relations.map((r) => [r.id, r.kind]));
  return {
    ...p,
    description: detail.description,
    attributes,
    images,
    equivalents: linked.filter((x) => kindOf.get(x.id) === "equivalent"),
    compatibles: linked.filter((x) => kindOf.get(x.id) === "compatible"),
    similar: [...linked.filter((x) => kindOf.get(x.id) === "similar"), ...similar].slice(0, 4),
  };
}

/** Chemins pré-générés au build ; les autres fiches sont générées à la demande puis mises en cache. */
export async function getPrerenderedProductSlugs() {
  return db.select({ slug: products.slug }).from(products)
    .where(and(visible, eq(products.isFeatured, true))).limit(200);
}

/** Prix et disponibilité à jour, pour revalider un panier côté serveur. */
export async function getProductsForCart(ids: number[]) {
  if (!ids.length) return [];
  return cardQuery().where(and(visible, inArray(products.id, ids)));
}
