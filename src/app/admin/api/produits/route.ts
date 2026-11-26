import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { brands, customers, productImages, products, stock } from "@/db/schema";
import { getCurrentUser, getUserAccess } from "@/server/auth/dal";
import { priceProducts } from "@/server/orders";
import type { Tx } from "@/server/audit";

/** Recherche produit pour les éditeurs (devis, achats, caisse). Personnel uniquement. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return Response.json({ error: "Non autorisé" }, { status: 401 });
  // Le prix d'achat (et donc la marge) n'est transmis qu'aux rôles autorisés.
  const canCost = (await getUserAccess(user.id)).permissions.has("products.view_cost");
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const customerId = Number(sp.get("client")) || null;
  // ?ids=1,2,3 : relire des produits précis (ex. recalcul des prix quand le client change).
  const ids = (sp.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300);
  if (!q && !ids.length) return Response.json({ items: [] });
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      barcode: products.barcode,
      manufacturerRef: products.manufacturerRef,
      brand: brands.name,
      imageUrl: sql<string | null>`(select i.url from ${productImages} i where i.product_id = ${products.id} order by i.is_primary desc, i.sort_order limit 1)`,
      unit: products.unit,
      vatRate: products.vatRate,
      purchasePrice: products.purchasePrice,
      available: sql<string>`coalesce((select sum(s.quantity_on_hand - s.quantity_reserved) from ${stock} s where s.product_id = ${products.id}), 0)`,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(
      ids.length
        ? inArray(products.id, ids)
        : and(eq(products.isActive, true), sql`${products.status} <> 'archived'`, or(eq(products.barcode, q), ilike(products.sku, like), ilike(products.name, like), ilike(products.manufacturerRef, like))),
    )
    .orderBy(desc(sql`${products.barcode} = ${q} or upper(${products.sku}) = upper(${q})`), products.name)
    .limit(ids.length ? 300 : 12);
  const customer = customerId ? (await db.select().from(customers).where(eq(customers.id, customerId)))[0] ?? null : null;
  const priced = await priceProducts(db as unknown as Tx, rows.map((r) => r.id), customer);
  return Response.json(
    {
      items: rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        vatRate: Number(r.vatRate),
        price: priced.get(r.id)?.price ?? null,
        cost: canCost && r.purchasePrice != null ? Number(r.purchasePrice) : null,
        manufacturerRef: r.manufacturerRef,
        brand: r.brand,
        imageUrl: r.imageUrl,
        available: Number(r.available),
        exact: r.barcode === q || r.sku.toUpperCase() === q.toUpperCase(),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
