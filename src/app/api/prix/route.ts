import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getCurrentCustomer, isApprovedPro } from "@/server/auth/dal";
import { priceProducts } from "@/server/orders";
import type { Tx } from "@/server/audit";

/** Prix personnalisés (pro validé / négociés) pour les produits affichés. Vérifié côté serveur. */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 100);
  const me = await getCurrentCustomer();
  const headers = { "Cache-Control": "private, no-store" };
  if (!me || !ids.length) return Response.json({ pro: false, prices: {} }, { headers });
  // Uniquement les produits visibles sur le site (un produit dépublié ou archivé ne révèle pas son prix).
  const visibleIds = (await db.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), eq(products.status, "published"), eq(products.isActive, true)))).map((r) => r.id);
  if (!visibleIds.length) return Response.json({ pro: isApprovedPro(me.customer), prices: {} }, { headers });
  const priced = await priceProducts(db as unknown as Tx, visibleIds, me.customer);
  const prices: Record<number, { ht: number; vat: number }> = {};
  for (const [id, p] of priced) if (p.price != null) prices[id] = { ht: p.price, vat: p.vat };
  return Response.json({ pro: isApprovedPro(me.customer), prices }, { headers });
}
