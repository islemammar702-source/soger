import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { activeFilterCount, parseCatalogParams, type RawParams } from "@/lib/catalog-params";
import { getCatalogFacets, getCategories, listProducts } from "@/server/catalog";
import { cn } from "@/lib/utils";
import { CatalogToolbar, FilterPanel } from "./catalog-controls";
import { ProductCard } from "./product-card";

/**
 * Catalogue paginé côté serveur (24 produits par page), filtres dans l'URL.
 * Lit les paramètres d'URL : à placer dans un <Suspense>.
 */
export async function ProductListing({
  searchParams,
  categorySlug,
  basePath,
}: {
  searchParams: Promise<RawParams>;
  categorySlug?: string;
  basePath: string;
}) {
  const sp = await searchParams;
  const { filters, view } = parseCatalogParams(sp);

  const [{ items, total, page, pageCount }, facets, categories] = await Promise.all([
    listProducts({ ...filters, categorySlug }),
    getCatalogFacets({ categorySlug, q: filters.q }),
    getCategories(),
  ]);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));
  const active = activeFilterCount(filters);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && k !== "page") params.set(k, val);
    }
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
      <aside className="hidden lg:block" aria-label="Filtres">
        <div className="sticky top-28">
          <FilterPanel facets={facets} />
        </div>
      </aside>

      <div className="min-w-0">
        {filters.q && (
          <p className="mb-2 text-sm text-steel">
            Résultats pour « <span className="font-medium text-ink">{filters.q}</span> »
          </p>
        )}
        <CatalogToolbar total={total} hasQuery={!!filters.q} activeCount={active} facets={facets} />

        {items.length === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line py-20 text-center">
            <SearchX className="size-10 text-steel/60" />
            <p className="mt-4 font-semibold">Aucun produit trouvé</p>
            <p className="mt-1 max-w-sm text-sm text-steel">
              {active > 0 ? "Essayez d'élargir vos filtres. " : "Vérifiez la référence. "}
              Nous trouvons aussi les pièces hors catalogue sur demande.
            </p>
            <Link href={`/devis${filters.q ? `?produit=${encodeURIComponent(filters.q)}` : ""}`} className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
              Demander un devis
            </Link>
          </div>
        ) : (
          <div className={cn("grid gap-4", view === "liste" ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}>
            {items.map((p) => (
              <ProductCard key={p.id} product={p} icon={iconOf.get(p.categorySlug ?? "")} layout={view === "liste" ? "list" : "grid"} />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
            <PageLink href={pageHref(page - 1)} disabled={page <= 1} label="Page précédente"><ChevronLeft className="size-4" /></PageLink>
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center gap-1">
                  {i > 0 && n - arr[i - 1] > 1 && <span className="px-1 text-steel">…</span>}
                  <PageLink href={pageHref(n)} active={n === page} label={`Page ${n}`}>{n}</PageLink>
                </span>
              ))}
            <PageLink href={pageHref(page + 1)} disabled={page >= pageCount} label="Page suivante"><ChevronRight className="size-4" /></PageLink>
          </nav>
        )}
      </div>
    </div>
  );
}

function PageLink({ href, active, disabled, label, children }: { href: string; active?: boolean; disabled?: boolean; label: string; children: React.ReactNode }) {
  const cls = cn(
    "grid size-10 place-items-center rounded-lg text-sm font-medium transition",
    active ? "bg-ink text-white" : "text-graphite hover:bg-mist",
    disabled && "pointer-events-none opacity-40",
  );
  return disabled ? (
    <span className={cls} aria-hidden>{children}</span>
  ) : (
    <Link href={href} className={cls} aria-label={label} aria-current={active ? "page" : undefined}>{children}</Link>
  );
}

export function ProductGridSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[250px_1fr]" aria-busy>
      <div className="hidden space-y-4 lg:block">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-5 animate-pulse rounded bg-mist" />)}
      </div>
      <div>
        <div className="mb-5 h-10 animate-pulse rounded-lg bg-mist" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
              <div className="aspect-[4/3] animate-pulse bg-mist" />
              <div className="space-y-2 p-4">
                <div className="h-3 w-1/3 animate-pulse rounded bg-mist" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-mist" />
                <div className="h-5 w-1/2 animate-pulse rounded bg-mist" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
