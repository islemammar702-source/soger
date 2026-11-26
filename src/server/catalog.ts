import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { brands, categories, productAttributes, productImages, products, stock } from "@/db/schema";

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

/**
 * Liste paginée côté serveur. Recherche : plein texte + similarité trigramme
 * (tolère les fautes : « roulment 6205 » → « Roulement 6205-2RS »).
 */
export async function listProducts(opts: { categorySlug?: string; brandSlug?: string; q?: string; page?: number }) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim().slice(0, 100);
  const filters: (SQL | undefined)[] = [visible];

  if (opts.categorySlug) {
    const cat = await getCategory(opts.categorySlug);
    if (!cat) return { items: [], total: 0, page, pageCount: 0 };
    filters.push(eq(products.categoryId, cat.id));
  }

  if (opts.brandSlug) {
    const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, opts.brandSlug));
    if (!brand) return { items: [], total: 0, page, pageCount: 0 };
    filters.push(eq(products.brandId, brand.id));
  }

  let rank: SQL | undefined;
  if (q) {
    const lq = q.toLowerCase();
    const brandIds = db.select({ id: brands.id }).from(brands).where(ilike(brands.name, `%${q}%`));
    filters.push(
      or(
        sql`${products.searchVector} @@ plainto_tsquery('simple', ${q})`,
        sql`lower(${products.sku}) like ${"%" + lq + "%"}`,
        sql`lower(${products.manufacturerRef}) like ${"%" + lq + "%"}`,
        eq(products.barcode, q),
        sql`lower(${products.name}) % ${lq}`,
        sql`word_similarity(${lq}, lower(${products.name})) > 0.45`,
        inArray(products.brandId, brandIds),
      ),
    );
    rank = sql`greatest(similarity(lower(${products.name}), ${lq}), similarity(lower(${products.sku}), ${lq}), ts_rank(${products.searchVector}, plainto_tsquery('simple', ${q})))`;
  }

  const where = and(...filters);
  const [items, [{ total }]] = await Promise.all([
    cardQuery()
      .where(where)
      .orderBy(...(rank ? [desc(rank)] : []), desc(products.isFeatured), asc(products.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where),
  ]);

  return { items, total, page, pageCount: Math.ceil(total / PAGE_SIZE) };
}

/* ─── Fiche produit ────────────────────────────────────────────────── */

export async function getProduct(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `product:${slug}`);
  const [p] = await cardQuery()
    .where(and(visible, eq(products.slug, slug)));
  if (!p) return null;
  const [detail] = await db
    .select({ description: products.description, categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, p.id));
  const [attributes, images, related] = await Promise.all([
    db.select({ label: productAttributes.label, value: productAttributes.value, unit: productAttributes.unit })
      .from(productAttributes).where(eq(productAttributes.productId, p.id)).orderBy(asc(productAttributes.sortOrder)),
    db.select({ url: productImages.url, alt: productImages.alt })
      .from(productImages).where(eq(productImages.productId, p.id)).orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder)),
    detail.categoryId
      ? cardQuery().where(and(visible, eq(products.categoryId, detail.categoryId), sql`${products.id} <> ${p.id}`)).limit(4)
      : Promise.resolve([]),
  ]);
  return { ...p, description: detail.description, attributes, images, related };
}

/** Chemins pré-générés au build ; les autres fiches sont générées à la demande puis mises en cache. */
export async function getPrerenderedProductSlugs() {
  return db.select({ slug: products.slug }).from(products)
    .where(and(visible, eq(products.isFeatured, true))).limit(200);
}
