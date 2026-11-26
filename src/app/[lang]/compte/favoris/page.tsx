import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { ProductCard } from "@/components/site/product-card";
import { getI18n } from "@/i18n/server";
import { getMyFavoriteIds } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";
import { getCategories, getProductsForCart } from "@/server/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.favoritesTitle, robots: { index: false } };
}

async function Favorites() {
  const { t, href } = await getI18n();
  const { user } = await requireCustomer(href("/compte/favoris"));
  const ids = (await getMyFavoriteIds(user.id)).map((f) => f.productId);
  const [products, categories] = await Promise.all([getProductsForCart(ids), getCategories()]);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  if (!products.length) return <EmptyState title={t.account.noFavorites} text={t.account.noFavoritesText} href="/produits" cta={t.account.seeCatalog} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => <ProductCard key={p.id} product={p} icon={iconOf.get(p.categorySlug ?? "")} />)}
    </div>
  );
}

export default async function FavoritesPage() {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.favoritesTitle} current="/compte/favoris">
      <Favorites />
    </AccountShell>
  );
}
