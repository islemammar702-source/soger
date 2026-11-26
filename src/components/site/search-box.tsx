"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Clock, FolderTree, Loader2, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useI18n } from "@/i18n/client";

type Suggestions = {
  products: { slug: string; sku: string; name: string; manufacturerRef: string | null; brandName: string | null; priceTTC: number | null }[];
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
};
type Option = { href: string; label: string; kind: "history" | "product" | "category" | "brand" | "all"; meta?: string; query?: string; price?: number | null };

const HISTORY_KEY = "soger.search-history.v1";

function readHistory(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function saveHistory(q: string) {
  try {
    const next = [q, ...readHistory().filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible */
  }
}
function clearHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* stockage indisponible */
  }
}

/** Recherche avec suggestions instantanées, navigation clavier et historique local. */
export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const { t, fmt, money, href: loc, category } = useI18n();
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Suggestions | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [active, setActive] = useState(-1);

  // Suggestions avec délai (évite une requête par touche) et annulation.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/recherche/suggestions?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) setData(await res.json());
      } catch {
        /* requête annulée ou réseau */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  const term = q.trim();
  const options: Option[] =
    term.length < 2
      ? history.map((h) => ({ kind: "history", label: h, query: h, href: `/produits?q=${encodeURIComponent(h)}` }))
      : [
          ...(data?.products ?? []).map((p) => ({
            kind: "product" as const,
            label: p.name,
            meta: [p.sku, p.brandName].filter(Boolean).join(" · "),
            href: `/produits/${p.slug}`,
            price: p.priceTTC,
          })),
          ...(data?.categories ?? []).map((c) => ({ kind: "category" as const, label: category(c.slug, c.name), href: `/categories/${c.slug}` })),
          ...(data?.brands ?? []).map((b) => ({ kind: "brand" as const, label: b.name, href: `/produits?marque=${b.slug}` })),
          { kind: "all" as const, label: fmt(t.search.allResults, { q: term }), query: term, href: `/produits?q=${encodeURIComponent(term)}` },
        ];

  const go = (opt: Option) => {
    const query = opt.kind === "all" || opt.kind === "history" ? opt.query : term.length >= 2 ? term : undefined;
    if (query) saveHistory(query);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    router.push(loc(opt.href));
  };

  const submit = () => {
    if (active >= 0 && options[active]) return go(options[active]);
    if (!term) return;
    go({ kind: "all", label: term, query: term, href: `/produits?q=${encodeURIComponent(term)}` });
  };

  const showPanel = open && (options.length > 0 || (term.length >= 2 && loading));

  return (
    <div className={cn("relative", className)}>
      <form
        role="search"
        action={loc("/produits")}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
        <input
          ref={inputRef}
          name="q"
          type="search"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={q}
          placeholder={t.search.placeholder}
          aria-label={t.search.aria}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => {
            setHistory(readHistory());
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
            if (e.target.value.trim().length < 2) setData(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(options.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(-1, i - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
          className="h-11 w-full rounded-lg border border-line bg-mist/70 ps-10 pe-10 text-sm text-ink transition outline-none placeholder:text-steel/80 focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {loading ? (
          <Loader2 className="absolute end-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-steel" aria-hidden />
        ) : (
          q && (
            <button type="button" aria-label={t.search.clear} onClick={() => { setQ(""); setData(null); inputRef.current?.focus(); }} className="absolute end-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-steel hover:bg-mist hover:text-ink">
              <X className="size-4" />
            </button>
          )
        )}
      </form>

      {showPanel && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-line bg-white shadow-lift md:start-auto md:w-[440px]">
          {term.length < 2 && history.length > 0 && (
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <p className="text-xs font-semibold tracking-wider text-steel uppercase">{t.search.recent}</p>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { clearHistory(); setHistory([]); }}
                className="text-xs font-medium text-steel hover:text-ink"
              >
                {t.search.clear}
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" aria-label={t.search.suggestions} className="max-h-[60vh] overflow-y-auto py-1.5">
            {options.map((o, i) => {
              const Icon = o.kind === "history" ? Clock : o.kind === "category" ? FolderTree : o.kind === "brand" ? Tag : Search;
              return (
                <li key={`${o.kind}-${o.href}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <Link
                    href={o.href}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      go(o);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-sm",
                      i === active ? "bg-mist" : "",
                      o.kind === "all" && "border-t border-line font-medium text-accent",
                    )}
                  >
                    {o.kind !== "product" && <Icon className="size-4 shrink-0 text-steel" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{o.label}</span>
                      {o.meta && <span className="block truncate font-mono text-xs text-steel">{o.meta}</span>}
                    </span>
                    {typeof o.price === "number" && <span className="shrink-0 text-xs font-semibold text-graphite">{money(o.price)}</span>}
                    {o.kind === "category" && <span className="shrink-0 text-xs text-steel">{t.search.category}</span>}
                    {o.kind === "brand" && <span className="shrink-0 text-xs text-steel">{t.search.brand}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
