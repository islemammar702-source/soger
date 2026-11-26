import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FileText, MessageCircle, PackageCheck, Repeat2, ShieldCheck, Wrench } from "lucide-react";
import { AddToCartForm } from "@/components/site/add-to-cart";
import { FavoriteButton } from "@/components/site/favorite-button";
import { ProPrice } from "@/components/site/pro-price";
import { PageHero } from "@/components/site/page-hero";
import { ProductGallery } from "@/components/site/product-gallery";
import { availabilityOf, ProductCard, toCartProduct } from "@/components/site/product-card";
import { SectionHeading } from "@/components/site/section";
import { ButtonLink } from "@/components/ui/button";
import { whatsappLink } from "@/config/site";
import { cn, formatTND, withVat } from "@/lib/utils";
import { getCategories, getPrerenderedProductSlugs, getProduct, type ProductCardData } from "@/server/catalog";

export async function generateStaticParams() {
  const rows = await getPrerenderedProductSlugs();
  return rows.length ? rows : [{ slug: "__aucun__" }];
}

export async function generateMetadata({ params }: PageProps<"/produits/[slug]">): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  return p ? { title: `${p.name} – ${p.sku}`, description: p.shortDescription ?? undefined } : {};
}

/**
 * Le contenu lit `params` : il est rendu dans un <Suspense> pour que la
 * navigation affiche immédiatement un squelette, même pour les fiches
 * non pré-générées.
 */
export default function ProductPage({ params }: PageProps<"/produits/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: { params: PageProps<"/produits/[slug]">["params"] }) {
  const { slug } = await params;
  const [p, categories] = await Promise.all([getProduct(slug), getCategories()]);
  if (!p) notFound();

  const icon = categories.find((c) => c.slug === p.categorySlug)?.icon;
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  const stock = availabilityOf(p);
  const qty = Number(p.available);
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
        <ProductGallery images={p.images} name={p.name} icon={icon} />

        <div>
          <div className="flex items-center justify-between gap-3">
            {p.brandSlug ? <Link href={`/produits?marque=${p.brandSlug}`} className="text-sm font-semibold tracking-wide text-steel uppercase hover:text-accent">{p.brandName}</Link> : <p className="text-sm font-semibold tracking-wide text-steel uppercase">{p.brandName}</p>}
            <FavoriteButton productId={p.id} slug={p.slug} />
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
            <dt className="text-steel">Référence SOGER</dt><dd className="font-mono font-medium">{p.sku}</dd>
            {p.manufacturerRef && (<><dt className="text-steel">Réf. fabricant</dt><dd className="font-mono font-medium">{p.manufacturerRef}</dd></>)}
            {p.brandName && (<><dt className="text-steel">Marque</dt><dd className="font-medium">{p.brandName}</dd></>)}
            {p.categoryName && (
              <><dt className="text-steel">Catégorie</dt><dd><Link href={`/categories/${p.categorySlug}`} className="hover:text-accent">{p.categoryName}</Link></dd></>
            )}
          </dl>

          <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-mist/50 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              {price !== null ? (
                <div>
                  <p className="font-display text-3xl font-bold">{formatTND(price)}</p>
                  <p className="text-xs text-steel">TTC / {p.unit} · {formatTND(p.salePrice)} HT · TVA {Number(p.vatRate)} %</p>
                  <ProPrice productId={p.id} publicHT={p.salePrice} />
                </div>
              ) : (
                <p className="text-lg font-semibold text-steel">Prix sur devis</p>
              )}
              <span className={cn("rounded-full px-3 py-1 text-xs font-medium", stock.tone)}>
                {stock.label}
                {qty > 0 && qty <= Number(p.minStock) && ` · ${qty} restant${qty > 1 ? "s" : ""}`}
              </span>
            </div>

            <div className="mt-5 space-y-2.5">
              {price !== null && <AddToCartForm product={toCartProduct(p, icon)} />}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <ButtonLink href={`/devis?produit=${encodeURIComponent(p.sku)}`} variant={price !== null ? "outline" : "primary"} size="lg" className="flex-1">
                  <FileText /> Demander un devis
                </ButtonLink>
                {wa && (
                  <ButtonLink href={wa} target="_blank" rel="noopener" variant="outline" size="lg" className="flex-1">
                    <MessageCircle /> WhatsApp
                  </ButtonLink>
                )}
              </div>
            </div>
            {qty <= 0 && <p className="mt-3 text-xs text-steel">Produit sur commande : le délai vous est confirmé avec votre devis.</p>}
          </div>

          {p.shortDescription && <p className="mt-8 font-medium leading-relaxed text-ink">{p.shortDescription}</p>}
          {p.description && p.description !== p.shortDescription && <div className="mt-4 leading-relaxed whitespace-pre-line text-graphite">{p.description}</div>}

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-steel">
            <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-accent" /> Produit de marque</li>
            <li className="flex items-center gap-2"><PackageCheck className="size-4 text-accent" /> Retrait en magasin possible</li>
          </ul>
        </div>
      </section>

      {p.attributes.length > 0 && (
        <section className="container-soger pb-12">
          <h2 className="text-xl font-bold">Caractéristiques techniques</h2>
          <dl className="mt-5 grid overflow-hidden rounded-[var(--radius-card)] border border-line md:grid-cols-2">
            {p.attributes.map((a, i) => (
              <div key={a.key + i} className="-mb-px grid grid-cols-2 gap-4 border-b border-line px-5 py-3 text-sm md:odd:border-r">
                <dt className="text-steel">{a.label}</dt>
                <dd className="font-medium">{a.value}{a.unit ? ` ${a.unit}` : ""}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <RelatedSection
        title="Produits équivalents"
        description="Même dimensions et usage, autres marques : utile en cas de rupture."
        icon={<Repeat2 className="size-5" />}
        items={p.equivalents}
        iconOf={iconOf}
      />
      <RelatedSection
        title="Produits compatibles"
        description="Pièces et consommables à prévoir avec ce produit."
        icon={<Wrench className="size-5" />}
        items={p.compatibles}
        iconOf={iconOf}
      />
      {p.similar.length > 0 && (
        <section className="border-t border-line bg-mist/60 py-12">
          <div className="container-soger">
            <SectionHeading title="Produits similaires" href={p.categorySlug ? `/categories/${p.categorySlug}` : undefined} />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {p.similar.map((r) => <ProductCard key={r.id} product={r} icon={iconOf.get(r.categorySlug ?? "")} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function RelatedSection({ title, description, icon, items, iconOf }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: ProductCardData[];
  iconOf: Map<string, string | null>;
}) {
  if (!items.length) return null;
  return (
    <section className="container-soger pb-12">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-hover">{icon}</span>
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-steel">{description}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((r) => <ProductCard key={r.id} product={r} icon={iconOf.get(r.categorySlug ?? "")} />)}
      </div>
    </section>
  );
}

function ProductSkeleton() {
  return (
    <div aria-busy>
      <section className="bg-ink">
        <div className="container-soger py-10 sm:py-14">
          <div className="h-3 w-48 animate-pulse rounded bg-white/10" />
          <div className="mt-5 h-10 w-2/3 animate-pulse rounded bg-white/10" />
        </div>
      </section>
      <section className="container-soger grid gap-10 py-10 lg:grid-cols-2 lg:py-14">
        <div className="aspect-square animate-pulse rounded-[var(--radius-card)] bg-mist" />
        <div className="space-y-4">
          <div className="h-4 w-24 animate-pulse rounded bg-mist" />
          <div className="h-4 w-64 animate-pulse rounded bg-mist" />
          <div className="h-4 w-56 animate-pulse rounded bg-mist" />
          <div className="mt-8 h-44 animate-pulse rounded-[var(--radius-card)] bg-mist" />
          <div className="h-16 animate-pulse rounded bg-mist" />
        </div>
      </section>
    </div>
  );
}
