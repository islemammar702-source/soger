import type { Metadata } from "next";
import { CartView } from "@/components/site/cart-view";
import { PageHero } from "@/components/site/page-hero";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.cart.title, robots: { index: false } };
}

export default async function CartPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHero title={t.cart.title} crumbs={[{ href: "/panier", label: t.cart.title }]} />
      <section className="container-soger py-10 lg:py-14">
        <CartView />
      </section>
    </>
  );
}
