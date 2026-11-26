import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHero } from "@/components/site/page-hero";
import { ProductGridSkeleton, ProductListing } from "@/components/site/product-listing";
import { getCategories, getCategory } from "@/server/catalog";

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const category = await getCategory((await params).slug);
  return category ? { title: category.name, description: category.description ?? undefined } : {};
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  const parent = category.sector === "industrial" ? { href: "/industrie", label: "Industrie" } : { href: "/agriculture", label: "Agriculture" };

  return (
    <>
      <PageHero title={category.name} description={category.description} crumbs={[parent, { href: `/categories/${slug}`, label: category.name }]} />
      <section className="container-soger py-10 lg:py-14">
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductListing searchParams={searchParams} categorySlug={slug} basePath={`/categories/${slug}`} />
        </Suspense>
      </section>
    </>
  );
}
