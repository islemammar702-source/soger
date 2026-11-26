import type { CatalogFilters, SortKey } from "@/server/catalog";
import { SORT_KEYS } from "./catalog-sorts";

/**
 * Paramètres d'URL du catalogue (partageables, indexables) :
 *   ?q=6205&marque=skf,fag&prix=10-50&stock=1&tri=prix-asc&vue=liste&page=2
 *   &f_inner_diameter=20-30   (plage sur une caractéristique numérique)
 */
export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | undefined) => {
  if (v === undefined || v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : null;
};

export function parseRange(v: string | undefined): [number | null, number | null] | null {
  if (!v) return null;
  const [a, b] = v.split("-");
  const range: [number | null, number | null] = [num(a), num(b)];
  return range[0] === null && range[1] === null ? null : range;
}

export function parseCatalogParams(sp: RawParams) {
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const brands = (one(sp.marque) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]{1,60}$/.test(s))
    .slice(0, 20);
  const price = parseRange(one(sp.prix));
  const attrs: Record<string, [number | null, number | null]> = {};
  for (const [k, v] of Object.entries(sp)) {
    const m = /^f_([a-z][a-z0-9_]{0,40})$/.exec(k);
    const r = m && parseRange(one(v));
    if (m && r && Object.keys(attrs).length < 8) attrs[m[1]] = r;
  }
  const sortRaw = one(sp.tri);
  const sort = SORT_KEYS.includes(sortRaw as SortKey) ? (sortRaw as SortKey) : undefined;
  const page = Math.min(10_000, Math.max(1, Number(one(sp.page)) || 1));
  const view: "grille" | "liste" = one(sp.vue) === "liste" ? "liste" : "grille";

  const filters: CatalogFilters = {
    q,
    brands: brands.length ? brands : undefined,
    priceMin: price?.[0] ?? undefined,
    priceMax: price?.[1] ?? undefined,
    inStock: one(sp.stock) === "1" || undefined,
    attrs: Object.keys(attrs).length ? attrs : undefined,
    sort,
    page,
  };
  return { filters, view };
}

/** Nombre de filtres actifs (hors recherche, tri, vue et page). */
export function activeFilterCount(f: CatalogFilters) {
  return (f.brands?.length ? 1 : 0) + (f.priceMin != null || f.priceMax != null ? 1 : 0) + (f.inStock ? 1 : 0) + Object.keys(f.attrs ?? {}).length;
}
