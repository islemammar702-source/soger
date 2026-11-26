import type { NextRequest } from "next/server";
import { db } from "@/db";
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
  const priced = await priceProducts(db as unknown as Tx, ids, me.customer);
  const prices: Record<number, { ht: number; vat: number }> = {};
  for (const [id, p] of priced) if (p.price != null) prices[id] = { ht: p.price, vat: p.vat };
  return Response.json({ pro: isApprovedPro(me.customer), prices }, { headers });
}
