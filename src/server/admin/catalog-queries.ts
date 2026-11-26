import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, productAttributes, productEquivalents, productImages, products, stock, warehouses } from "@/db/schema";

export const ADMIN_PAGE_SIZE = 50;
const esc = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export const availableExpr = sql<string>`coalesce((select sum(s.quantity_on_hand - s.quantity_reserved) from ${stock} s where s.product_id = ${products.id}), 0)`;
export const onHandExpr = sql<string>`coalesce((select sum(s.quantity_on_hand) from ${stock} s where s.product_id = ${products.id}), 0)`;

export async function listAdminProducts(f: { q?: string; category?: number; brand?: number; status?: string; alert?: boolean; page: number }) {
  const conds: (SQL | undefined)[] = [];
  if (f.q) {
    const like = `%${esc(f.q)}%`;
    conds.push(or(ilike(products.sku, like), ilike(products.name, like), ilike(products.manufacturerRef, like), eq(products.barcode, f.q)));
  }
  if (f.category) conds.push(eq(products.categoryId, f.category));
  if (f.brand) conds.push(eq(products.brandId, f.brand));
  if (f.status === "inactive") conds.push(eq(products.isActive, false));
  else if (f.status) conds.push(sql`${products.status} = ${f.status}`);
  else conds.push(sql`${products.status} <> 'archived'`);
  if (f.alert) conds.push(sql`${availableExpr} <= ${products.minStock}`);
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        status: products.status,
        isActive: products.isActive,
        salePrice: products.salePrice,
        purchasePrice: products.purchasePrice,
        vatRate: products.vatRate,
        minStock: products.minStock,
        unit: products.unit,
        brand: brands.name,
        category: categories.name,
        onHand: onHandExpr,
        available: availableExpr,
      })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(asc(products.name))
      .limit(ADMIN_PAGE_SIZE)
      .offset((f.page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(products).where(where),
  ]);
  return { rows, total, pageCount: Math.ceil(total / ADMIN_PAGE_SIZE) };
}

export async function getAdminProduct(id: number) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) return null;
  const [attributes, images, relations, stockRows] = await Promise.all([
    db.select().from(productAttributes).where(eq(productAttributes.productId, id)).orderBy(productAttributes.sortOrder),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(desc(productImages.isPrimary), productImages.sortOrder),
    db
      .select({ sku: products.sku, kind: productEquivalents.kind })
      .from(productEquivalents)
      .innerJoin(products, eq(products.id, productEquivalents.relatedProductId))
      .where(eq(productEquivalents.productId, id)),
    db
      .select({ warehouse: warehouses.name, code: warehouses.code, onHand: stock.quantityOnHand, reserved: stock.quantityReserved, location: stock.location })
      .from(stock)
      .innerJoin(warehouses, eq(warehouses.id, stock.warehouseId))
      .where(eq(stock.productId, id)),
  ]);
  return { p, attributes, images, relations, stockRows };
}

export const getCategoryOptions = () => db.select({ id: categories.id, name: categories.name, sector: categories.sector }).from(categories).orderBy(categories.sector, categories.sortOrder);
export const getBrandOptions = () => db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(brands.name);
