/**
 * Seed idempotent : n'insère que ce qui manque, ne modifie et ne supprime
 * jamais de données existantes. Peut être relancé sans risque.
 *
 *   npm run db:seed          → référentiels (rôles, permissions, catégories, marques, dépôt)
 *   npm run db:seed -- --demo → + produits de démonstration avec stock initial
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { Pool } from "pg";
import * as s from "../schema";
import { ALL_PERMISSIONS, ROLE_DEFINITIONS } from "../../lib/permissions";
import { applyStockMovement } from "../../server/inventory";
import { AGRICULTURAL_CATEGORIES, BRANDS, DEMO_PRODUCTS, DEMO_RELATIONS, INDUSTRIAL_CATEGORIES } from "./data";

const slugify = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema: s });
  const withDemo = process.argv.includes("--demo");

  await db.transaction(async (tx) => {
    // Permissions et rôles
    await tx.insert(s.permissions).values(
      ALL_PERMISSIONS.map((key) => {
        const [module, action] = key.split(".");
        return { key, module, action };
      }),
    ).onConflictDoNothing();

    await tx.insert(s.roles).values(
      ROLE_DEFINITIONS.map(({ key, name, description }) => ({ key, name, description, isSystem: true })),
    ).onConflictDoNothing();

    const perms = await tx.select().from(s.permissions);
    const roles = await tx.select().from(s.roles);
    const permId = new Map(perms.map((p) => [p.key, p.id]));
    for (const def of ROLE_DEFINITIONS) {
      const role = roles.find((r) => r.key === def.key)!;
      await tx.insert(s.rolePermissions).values(
        def.permissions.map((p) => ({ roleId: role.id, permissionId: permId.get(p)! })),
      ).onConflictDoNothing();
    }

    // Dépôt principal
    await tx.insert(s.warehouses).values({ code: "MAG", name: "Magasin principal", isDefault: true }).onConflictDoNothing();

    // Catégories
    await tx.insert(s.categories).values([
      ...INDUSTRIAL_CATEGORIES.map((c, i) => ({ ...c, sector: "industrial" as const, sortOrder: i })),
      ...AGRICULTURAL_CATEGORIES.map((c, i) => ({ ...c, sector: "agricultural" as const, sortOrder: i })),
    ]).onConflictDoNothing();

    // Marques
    await tx.insert(s.brands).values(BRANDS.map((b, i) => ({ ...b, sortOrder: i }))).onConflictDoNothing();

    // Séquences de numérotation
    const year = new Date().getFullYear();
    await tx.insert(s.documentSequences).values([
      { key: "quote", prefix: "DEV", year },
      { key: "order", prefix: "CMD", year },
      { key: "invoice", prefix: "FAC", year },
      { key: "credit_note", prefix: "AV", year },
      { key: "purchase_order", prefix: "BCF", year },
      { key: "goods_receipt", prefix: "BR", year },
      { key: "customer", prefix: "CLI", year: 0 },
      { key: "supplier", prefix: "FRS", year: 0 },
    ]).onConflictDoNothing();

    if (!withDemo) return;

    const [warehouse] = await tx.select().from(s.warehouses).where(eq(s.warehouses.code, "MAG"));
    const cats = await tx.select({ id: s.categories.id, slug: s.categories.slug }).from(s.categories);
    const brs = await tx.select({ id: s.brands.id, slug: s.brands.slug }).from(s.brands);
    const catId = new Map(cats.map((c) => [c.slug, c.id]));
    const brandId = new Map(brs.map((b) => [b.slug, b.id]));

    const existing = new Set(
      (await tx.select({ sku: s.products.sku }).from(s.products)
        .where(inArray(s.products.sku, DEMO_PRODUCTS.map((p) => p.sku)))).map((r) => r.sku),
    );

    for (const p of DEMO_PRODUCTS.filter((p) => !existing.has(p.sku))) {
      const [row] = await tx.insert(s.products).values({
        sku: p.sku,
        manufacturerRef: p.mref,
        slug: slugify(`${p.name}-${p.sku}`),
        name: p.name,
        shortDescription: p.short,
        description: `${p.short} Produit de démonstration : remplacez cette fiche par vos données réelles.`,
        categoryId: catId.get(p.category),
        brandId: brandId.get(p.brand),
        unit: p.unit ?? "pièce",
        purchasePrice: p.purchase.toFixed(3),
        salePrice: p.sale.toFixed(3),
        proPrice: p.pro.toFixed(3),
        minStock: String(p.min ?? 0),
        status: "published",
        isFeatured: p.featured ?? false,
        isNew: p.isNew ?? false,
      }).returning({ id: s.products.id });

      if (p.attrs?.length) {
        await tx.insert(s.productAttributes).values(p.attrs.map(([key, label, value, unit], i) => ({
          productId: row.id, key, label, value, unit,
          numericValue: /^\d+(\.\d+)?$/.test(value) ? value : null,
          sortOrder: i,
        })));
      }
      if (p.stock > 0) {
        await applyStockMovement(tx, {
          productId: row.id, warehouseId: warehouse.id, type: "opening",
          quantity: p.stock, unitCost: p.purchase.toFixed(3), note: "Stock initial (démo)",
        });
      } else {
        await tx.insert(s.stock).values({ productId: row.id, warehouseId: warehouse.id }).onConflictDoNothing();
      }
    }
    console.log(`Produits de démo ajoutés : ${DEMO_PRODUCTS.length - existing.size}`);

    // Produits équivalents / compatibles
    const idBySku = new Map(
      (await tx.select({ id: s.products.id, sku: s.products.sku }).from(s.products)
        .where(inArray(s.products.sku, DEMO_RELATIONS.flatMap(([a, b]) => [a, b])))).map((r) => [r.sku, r.id]),
    );
    const relations = DEMO_RELATIONS.filter(([a, b]) => idBySku.has(a) && idBySku.has(b)).map(([a, b, kind]) => ({
      productId: idBySku.get(a)!, relatedProductId: idBySku.get(b)!, kind,
    }));
    if (relations.length) await tx.insert(s.productEquivalents).values(relations).onConflictDoNothing();
    console.log(`Relations entre produits : ${relations.length}`);
  });

  console.log("Seed terminé.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
