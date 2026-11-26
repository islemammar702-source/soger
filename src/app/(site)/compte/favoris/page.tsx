import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { ProductCard } from "@/components/site/product-card";
import { getMyFavoriteIds } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";
import { getCategories, getProductsForCart } from "@/server/catalog";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false } };

async function Favorites() {
  const { user } = await requireCustomer("/compte/favoris");
  const ids = (await getMyFavoriteIds(user.id)).map((f) => f.productId);
  const [products, categories] = await Promise.all([getProductsForCart(ids), getCategories()]);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  if (!products.length) return <EmptyState title="Aucun favori" text="Ajoutez des produits en favoris depuis leur fiche (icône cœur)." href="/produits" cta="Voir le catalogue" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => <ProductCard key={p.id} product={p} icon={iconOf.get(p.categorySlug ?? "")} />)}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <AccountShell title="Mes favoris" current="/compte/favoris">
      <Favorites />
    </AccountShell>
  );
}
