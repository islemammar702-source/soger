import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHero } from "@/components/site/page-hero";
import { ProductGridSkeleton, ProductListing } from "@/components/site/product-listing";
import { getCategories, getCategory } from "@/server/catalog";
import { getI18n } from "@/i18n/server";

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/categories/[slug]">): Promise<Metadata> {
  const { category: catName, categoryDescription } = await getI18n();
  const category = await getCategory((await params).slug);
  return category ? { title: catName(category.slug, category.name), description: categoryDescription(category.slug, category.description) || undefined } : {};
}

export default function CategoryPage({ params, searchParams }: PageProps<"/[lang]/categories/[slug]">) {
  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function CategorySkeleton() {
  return (
    <div aria-busy>
      <section className="bg-ink">
        <div className="container-soger py-10 sm:py-14">
          <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
          <div className="mt-5 h-10 w-1/2 animate-pulse rounded bg-white/10" />
          <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-white/10" />
        </div>
      </section>
      <section className="container-soger py-10 lg:py-14">
        <ProductGridSkeleton />
      </section>
    </div>
  );
}

async function CategoryContent({ params, searchParams }: PageProps<"/[lang]/categories/[slug]">) {
  const { t, category: catName, categoryDescription } = await getI18n();
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  const parent = category.sector === "industrial" ? { href: "/industrie", label: t.nav.industry } : { href: "/agriculture", label: t.nav.agriculture };
  const name = catName(category.slug, category.name);

  return (
    <>
      <PageHero title={name} description={categoryDescription(category.slug, category.description)} crumbs={[parent, { href: `/categories/${slug}`, label: name }]} />
      <section className="container-soger py-10 lg:py-14">
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductListing searchParams={searchParams} categorySlug={slug} basePath={`/categories/${slug}`} />
        </Suspense>
      </section>
    </>
  );
}
