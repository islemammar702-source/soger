import type { NextRequest } from "next/server";
import { getSearchSuggestions } from "@/server/catalog";
import { withVat } from "@/lib/utils";

/** Saisie semi-automatique de la barre de recherche (résultats mis en cache quelques minutes). */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  const data = await getSearchSuggestions(q);
  return Response.json(
    {
      products: data.products.map((p) => ({
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        manufacturerRef: p.manufacturerRef,
        brandName: p.brandName,
        priceTTC: p.salePrice ? withVat(p.salePrice, p.vatRate) : null,
      })),
      categories: data.categories,
      brands: data.brands,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
