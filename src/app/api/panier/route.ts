import { z } from "zod";
import { getCategories, getProductsForCart } from "@/server/catalog";

const body = z.object({ ids: z.array(z.number().int().positive()).max(200) });

/** Revalide le panier : prix, nom et disponibilité à jour depuis la base. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requête invalide" }, { status: 400 });
  const [rows, categories] = await Promise.all([getProductsForCart(parsed.data.ids), getCategories()]);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  return Response.json({
    products: rows.map((p) => ({
      productId: p.id,
      slug: p.slug,
      sku: p.sku,
      name: p.name,
      brandName: p.brandName,
      unit: p.unit,
      unitPrice: p.salePrice,
      vatRate: p.vatRate,
      imageUrl: p.imageUrl,
      icon: iconOf.get(p.categorySlug ?? "") ?? null,
      available: Number(p.available),
    })),
  });
}
