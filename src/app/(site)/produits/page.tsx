import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/site/page-hero";
import { ProductGridSkeleton, ProductListing } from "@/components/site/product-listing";

export const metadata: Metadata = {
  title: "Catalogue produits",
  description: "Recherchez par référence SOGER, référence fabricant, désignation ou marque.",
};

export default function ProductsPage({ searchParams }: PageProps<"/produits">) {
  return (
    <>
      <PageHero title="Catalogue produits" description="Recherchez par référence SOGER, référence fabricant, code-barres, désignation ou marque." crumbs={[{ href: "/produits", label: "Produits" }]} />
      <section className="container-soger py-10 lg:py-14">
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductListing searchParams={searchParams} basePath="/produits" />
        </Suspense>
      </section>
    </>
  );
}
