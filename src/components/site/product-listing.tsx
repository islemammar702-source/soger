import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { getCategories, listProducts } from "@/server/catalog";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Grille paginée côté serveur (24 produits par page).
 * Lit les paramètres d'URL : à placer dans un <Suspense>.
 */
export async function ProductListing({
  searchParams,
  categorySlug,
  basePath,
}: {
  searchParams: SearchParams;
  categorySlug?: string;
  basePath: string;
}) {
  const sp = await searchParams;
  const q = one(sp.q);
  const brandSlug = one(sp.marque);
  const page = Number(one(sp.page)) || 1;

  const [{ items, total, pageCount }, categories] = await Promise.all([
    listProducts({ categorySlug, brandSlug, q, page }),
    getCategories(),
  ]);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (brandSlug) params.set("marque", brandSlug);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  if (!items.length) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line py-20 text-center">
        <SearchX className="size-10 text-steel/60" />
        <p className="mt-4 font-semibold">Aucun produit trouvé</p>
        <p className="mt-1 max-w-sm text-sm text-steel">
          Vérifiez la référence ou demandez-nous un devis : nous trouvons aussi les pièces hors catalogue.
        </p>
        <Link href={`/devis${q ? `?produit=${encodeURIComponent(q)}` : ""}`} className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
          Demander un devis
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-5 text-sm text-steel">
        {total} produit{total > 1 ? "s" : ""}
        {q && <> pour « <span className="font-medium text-ink">{q}</span> »</>}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} icon={iconOf.get(p.categorySlug ?? "")} />
        ))}
      </div>
      {pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
          <PageLink href={href(page - 1)} disabled={page <= 1} label="Page précédente"><ChevronLeft className="size-4" /></PageLink>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1)
            .map((n, i, arr) => (
              <span key={n} className="flex items-center gap-1">
                {i > 0 && n - arr[i - 1] > 1 && <span className="px-1 text-steel">…</span>}
                <PageLink href={href(n)} active={n === page} label={`Page ${n}`}>{n}</PageLink>
              </span>
            ))}
          <PageLink href={href(page + 1)} disabled={page >= pageCount} label="Page suivante"><ChevronRight className="size-4" /></PageLink>
        </nav>
      )}
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy>
      {Array.from({ length: 8 }, (_, i) => (
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
  );
}
