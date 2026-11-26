import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { getBrands } from "@/server/catalog";

export const metadata: Metadata = { title: "Marques", description: "Les marques de composants industriels distribuées par SOGER." };

export default async function BrandsPage() {
  const brands = await getBrands();
  return (
    <>
      <PageHero title="Nos marques" description="Des fabricants reconnus de roulements, transmission, hydraulique, pompes et lubrifiants." crumbs={[{ href: "/marques", label: "Marques" }]} />
      <section className="container-soger py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {brands.map((b) => (
            <Link key={b.slug} href={`/produits?marque=${b.slug}`} className="group flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift">
              <span className="font-display text-2xl font-bold tracking-tight text-ink">{b.name}</span>
              {b.country && <span className="mt-1 text-sm text-steel">{b.country}</span>}
              <span className="mt-6 text-sm font-medium text-accent opacity-0 transition group-hover:opacity-100">Voir les produits →</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
