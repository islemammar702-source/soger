import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { getCategories, getProductsBySector, type Sector } from "@/server/catalog";
import { CategoryIcon } from "./category-icon";
import { PageHero } from "./page-hero";
import { ProductCard } from "./product-card";
import { SectionHeading } from "./section";

export async function SectorPage({ sector }: { sector: Sector }) {
  const { t, plural, category, categoryDescription } = await getI18n();
  const [categories, products] = await Promise.all([getCategories(sector), getProductsBySector(sector, 8)]);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  const industrial = sector === "industrial";
  const title = industrial ? t.sector.industryTitle : t.sector.agriTitle;
  return (
    <>
      <PageHero title={title} description={industrial ? t.sector.industryText : t.sector.agriText} crumbs={[{ href: industrial ? "/industrie" : "/agriculture", label: title }]} />
      <section className="container-soger py-12 lg:py-16">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link key={c.slug} href={`/categories/${c.slug}`} className="group flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-mist text-ink transition group-hover:bg-accent group-hover:text-white">
                <CategoryIcon name={c.icon} className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-semibold">
                  {category(c.slug, c.name)}
                  <ArrowRight className="size-4 shrink-0 text-steel transition group-hover:translate-x-0.5 group-hover:text-accent rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                </span>
                <span className="mt-1 line-clamp-2 block text-sm text-steel">{categoryDescription(c.slug, c.description)}</span>
                <span className="mt-2 block text-xs font-medium text-steel/80">{plural(t.common.productCount, c.productCount)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      {products.length > 0 && (
        <section className="border-t border-line bg-mist/60 py-12 lg:py-16">
          <div className="container-soger">
            <SectionHeading title={t.sector.selection} href="/produits" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((p) => <ProductCard key={p.id} product={p} icon={iconOf.get(p.categorySlug ?? "")} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
