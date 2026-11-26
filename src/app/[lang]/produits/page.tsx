import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/site/page-hero";
import { ProductGridSkeleton, ProductListing } from "@/components/site/product-listing";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.catalog.title, description: t.catalog.meta };
}

export default async function ProductsPage({ searchParams }: PageProps<"/[lang]/produits">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHero title={t.catalog.title} description={t.catalog.text} crumbs={[{ href: "/produits", label: t.catalog.crumb }]} />
      <section className="container-soger py-10 lg:py-14">
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductListing searchParams={searchParams} basePath="/produits" />
        </Suspense>
      </section>
    </>
  );
}
