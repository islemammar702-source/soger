import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { getBrands } from "@/server/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.brandsPage.crumb, description: t.brandsPage.meta };
}

export default async function BrandsPage() {
  const { t } = await getI18n();
  const brands = await getBrands();
  return (
    <>
      <PageHero title={t.brandsPage.title} description={t.brandsPage.text} crumbs={[{ href: "/marques", label: t.brandsPage.crumb }]} />
      <section className="container-soger py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {brands.map((b) => (
            <Link key={b.slug} href={`/produits?marque=${b.slug}`} className="group flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift">
              <span className="font-display text-2xl font-bold tracking-tight text-ink">{b.name}</span>
              {b.country && <span className="mt-1 text-sm text-steel">{b.country}</span>}
              <span className="mt-6 text-sm font-medium text-accent opacity-0 transition group-hover:opacity-100">{t.common.viewProducts}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
