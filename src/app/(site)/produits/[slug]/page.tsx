import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FileText, MessageCircle, PackageCheck, ShieldCheck } from "lucide-react";
import { CategoryIcon } from "@/components/site/category-icon";
import { PageHero } from "@/components/site/page-hero";
import { availabilityOf, ProductCard } from "@/components/site/product-card";
import { SectionHeading } from "@/components/site/section";
import { ButtonLink } from "@/components/ui/button";
import { whatsappLink } from "@/config/site";
import { cn, formatTND, withVat } from "@/lib/utils";
import { getCategories, getPrerenderedProductSlugs, getProduct } from "@/server/catalog";

export async function generateStaticParams() {
  const rows = await getPrerenderedProductSlugs();
  return rows.length ? rows : [{ slug: "__aucun__" }];
}

export async function generateMetadata({ params }: PageProps<"/produits/[slug]">): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  return p ? { title: `${p.name} – ${p.sku}`, description: p.shortDescription ?? undefined } : {};
}

export default async function ProductPage({ params }: PageProps<"/produits/[slug]">) {
  const { slug } = await params;
  const [p, categories] = await Promise.all([getProduct(slug), getCategories()]);
  if (!p) notFound();

  const icon = categories.find((c) => c.slug === p.categorySlug)?.icon;
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  const stock = availabilityOf(p);
  const price = p.salePrice ? withVat(p.salePrice, p.vatRate) : null;
  const wa = whatsappLink(`Bonjour SOGER, je suis intéressé par : ${p.name} (réf. ${p.sku}).`);
  const crumbs = [
    ...(p.categorySlug ? [{ href: `/categories/${p.categorySlug}`, label: p.categoryName ?? "" }] : []),
    { href: `/produits/${p.slug}`, label: p.sku },
  ];

  return (
    <>
      <PageHero title={p.name} crumbs={crumbs} />
      <section className="container-soger grid gap-10 py-10 lg:grid-cols-2 lg:py-14">
        {/* Visuel (galerie + zoom complets en phase 5) */}
        <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] border border-line bg-gradient-to-br from-mist to-white">
          {p.images[0] ? (
            <Image src={p.images[0].url} alt={p.images[0].alt ?? p.name} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-8" />
          ) : (
            <div className="grid h-full place-items-center"><CategoryIcon name={icon} className="size-28 text-steel/30" /></div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold tracking-wide text-steel uppercase">{p.brandName}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-steel">Référence SOGER</dt><dd className="font-mono font-medium">{p.sku}</dd>
            {p.manufacturerRef && (<><dt className="text-steel">Réf. fabricant</dt><dd className="font-mono font-medium">{p.manufacturerRef}</dd></>)}
            {p.categoryName && (<><dt className="text-steel">Catégorie</dt><dd>{p.categoryName}</dd></>)}
          </dl>

          <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-mist/50 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              {price !== null ? (
                <div>
                  <p className="font-display text-3xl font-bold">{formatTND(price)}</p>
                  <p className="text-xs text-steel">TTC / {p.unit} · {formatTND(p.salePrice)} HT</p>
                </div>
              ) : (
                <p className="text-lg font-semibold text-steel">Prix sur devis</p>
              )}
              <span className={cn("rounded-full px-3 py-1 text-xs font-medium", stock.tone)}>{stock.label}</span>
            </div>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <ButtonLink href={`/devis?produit=${encodeURIComponent(p.sku)}`} size="lg" className="flex-1">
                <FileText /> Demander un devis
              </ButtonLink>
              {wa && (
                <ButtonLink href={wa} target="_blank" rel="noopener" variant="outline" size="lg" className="flex-1">
                  <MessageCircle /> WhatsApp
                </ButtonLink>
              )}
            </div>
            <p className="mt-3 text-xs text-steel">Le panier et la commande en ligne arrivent dans la prochaine étape.</p>
          </div>

          {p.shortDescription && <p className="mt-8 leading-relaxed text-graphite">{p.description ?? p.shortDescription}</p>}

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-steel">
            <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-accent" /> Produit de marque</li>
            <li className="flex items-center gap-2"><PackageCheck className="size-4 text-accent" /> Retrait en magasin possible</li>
          </ul>
        </div>
      </section>

      {p.attributes.length > 0 && (
        <section className="container-soger pb-12">
          <h2 className="text-xl font-bold">Caractéristiques techniques</h2>
          <dl className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-line">
            {p.attributes.map((a, i) => (
              <div key={a.label} className={cn("grid grid-cols-2 gap-4 px-5 py-3 text-sm", i % 2 ? "bg-white" : "bg-mist/60")}>
                <dt className="text-steel">{a.label}</dt>
                <dd className="font-medium">{a.value}{a.unit ? ` ${a.unit}` : ""}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {p.related.length > 0 && (
        <section className="border-t border-line bg-mist/60 py-12">
          <div className="container-soger">
            <SectionHeading title="Produits similaires" href={p.categorySlug ? `/categories/${p.categorySlug}` : undefined} />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {p.related.map((r) => <ProductCard key={r.id} product={r} icon={iconOf.get(r.categorySlug ?? "")} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
