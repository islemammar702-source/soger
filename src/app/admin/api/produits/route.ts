import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { customers, products, stock } from "@/db/schema";
import { getCurrentUser } from "@/server/auth/dal";
import { priceProducts } from "@/server/orders";
import type { Tx } from "@/server/audit";

/** Recherche produit pour les éditeurs (devis, achats, caisse). Personnel uniquement. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return Response.json({ error: "Non autorisé" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const customerId = Number(sp.get("client")) || null;
  if (!q) return Response.json({ items: [] });
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      barcode: products.barcode,
      unit: products.unit,
      vatRate: products.vatRate,
      purchasePrice: products.purchasePrice,
      available: sql<string>`coalesce((select sum(s.quantity_on_hand - s.quantity_reserved) from ${stock} s where s.product_id = ${products.id}), 0)`,
    })
    .from(products)
    .where(and(eq(products.isActive, true), sql`${products.status} <> 'archived'`, or(eq(products.barcode, q), ilike(products.sku, like), ilike(products.name, like), ilike(products.manufacturerRef, like))))
    .orderBy(desc(sql`${products.barcode} = ${q} or upper(${products.sku}) = upper(${q})`), products.name)
    .limit(12);
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
        cost: r.purchasePrice == null ? null : Number(r.purchasePrice),
        available: Number(r.available),
        exact: r.barcode === q || r.sku.toUpperCase() === q.toUpperCase(),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
