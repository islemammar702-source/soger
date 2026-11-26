import type { Metadata } from "next";
import { CartView } from "@/components/site/cart-view";
import { PageHero } from "@/components/site/page-hero";

export const metadata: Metadata = { title: "Panier", robots: { index: false } };

export default function CartPage() {
  return (
    <>
      <PageHero title="Panier" crumbs={[{ href: "/panier", label: "Panier" }]} />
      <section className="container-soger py-10 lg:py-14">
        <CartView />
      </section>
    </>
  );
}
