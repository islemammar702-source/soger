import { and, eq, inArray, or, sql } from "drizzle-orm";
import { qcol } from "@/db/qcol";
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
  const esc = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
  const lq = q.toLowerCase();
  // Plusieurs mots (« roulement 6205 ») : chaque mot doit apparaître dans le nom ou une référence.
  // lower(…) like … utilise les index trigrammes existants (products_*_trgm_idx), insensible à la casse.
  const words = lq.split(/\s+/).filter(Boolean).slice(0, 6);
  const wordMatch = words.map((w) => {
    const l = `%${esc(w)}%`;
    return sql`(lower(${products.name}) like ${l} or lower(${products.sku}) like ${l} or lower(${products.manufacturerRef}) like ${l})`;
  });
  const prefix = `${esc(lq)}%`;
  // Pertinence : code-barres / référence exacts, puis début de référence, puis début du nom, puis le reste.
  const rank = sql`case
    when ${products.barcode} = ${q} or lower(${products.sku}) = ${lq} or lower(${products.manufacturerRef}) = ${lq} then 0
    when lower(${products.sku}) like ${prefix} or lower(${products.manufacturerRef}) like ${prefix} then 1
    when lower(${products.name}) like ${prefix} then 2
    when lower(${products.name}) like ${`% ${esc(lq)}%`} then 3
    else 4 end`;
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      barcode: products.barcode,
      manufacturerRef: products.manufacturerRef,
      brand: brands.name,
      imageUrl: sql<string | null>`(select i.url from ${productImages} i where i.product_id = ${qcol(products.id)} order by i.is_primary desc, i.sort_order limit 1)`,
      unit: products.unit,
      vatRate: products.vatRate,
      purchasePrice: products.purchasePrice,
      available: sql<string>`coalesce((select sum(s.quantity_on_hand - s.quantity_reserved) from ${stock} s where s.product_id = ${qcol(products.id)}), 0)`,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(
      ids.length
        ? inArray(products.id, ids)
        : and(eq(products.isActive, true), sql`${products.status} <> 'archived'`, or(eq(products.barcode, q), and(...wordMatch))),
    )
    .orderBy(ids.length ? products.id : rank, products.name)
    .limit(ids.length ? 300 : 10);
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
        exact: r.barcode === q || r.sku.toUpperCase() === q.toUpperCase() || (!!r.manufacturerRef && r.manufacturerRef.toUpperCase() === q.toUpperCase()),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
