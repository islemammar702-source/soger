import { z } from "zod";
import { db } from "@/db";
import { getCurrentCustomer } from "@/server/auth/dal";
import { getCategories, getProductsForCart } from "@/server/catalog";
import { priceProducts } from "@/server/orders";
import type { Tx } from "@/server/audit";

const body = z.object({ ids: z.array(z.number().int().positive()).max(200) });

/**
 * Revalide le panier : nom, disponibilité et prix à jour depuis la base,
 * avec les prix du client connecté (prix pro validé, prix négocié).
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requête invalide" }, { status: 400 });
  const me = await getCurrentCustomer();
  const [rows, categories, priced] = await Promise.all([
    getProductsForCart(parsed.data.ids),
    getCategories(),
    priceProducts(db as unknown as Tx, parsed.data.ids, me?.customer ?? null),
  ]);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  return Response.json(
    {
      products: rows.map((p) => {
        const price = priced.get(p.id)?.price;
        return {
          productId: p.id,
          slug: p.slug,
          sku: p.sku,
          name: p.name,
          brandName: p.brandName,
          unit: p.unit,
          unitPrice: price == null ? null : price.toFixed(3),
          vatRate: p.vatRate,
          imageUrl: p.imageUrl,
          icon: iconOf.get(p.categorySlug ?? "") ?? null,
          available: Number(p.available),
        };
      }),
      pro: !!me && me.customer.type === "professional" && me.customer.priceTier === "professional",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
