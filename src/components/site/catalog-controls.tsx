"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, LayoutGrid, List, Loader2, SlidersHorizontal, X } from "lucide-react";
import { SORT_KEYS } from "@/lib/catalog-sorts";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

const noop = () => () => {};

export type Facets = {
  brands: { slug: string; name: string; count: number }[];
  price: { min: number; max: number } | null;
  attributes: { key: string; label: string; unit: string | null; min: number; max: number; count: number }[];
};

/** Met à jour l'URL (et donc les résultats rendus côté serveur) sans recharger la page. */
function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (mutate: (p: URLSearchParams) => void, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    if (!keepPage) next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, update, pending };
}

/* ─── Barre d'outils : nombre de résultats, tri, vue ──────────────────── */

export function CatalogToolbar({ total, hasQuery, activeCount, facets }: { total: number; hasQuery: boolean; activeCount: number; facets: Facets }) {
  const { t, plural } = useI18n();
  const { params, update, pending } = useUpdateParams();
  const sort = params.get("tri") ?? (hasQuery ? "pertinence" : "nom");
  const view = params.get("vue") === "liste" ? "liste" : "grille";
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-sm font-medium lg:hidden"
      >
        <SlidersHorizontal className="size-4" /> {t.catalog.filters}
        {activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] text-white">{activeCount}</span>}
      </button>

      <p className="me-auto flex items-center gap-2 text-sm text-steel" aria-live="polite">
        {pending && <Loader2 className="size-4 animate-spin text-accent" />}
        <span>{plural(t.common.productCount, total)}</span>
      </p>

      <label className="flex items-center gap-2 text-sm text-steel">
        <span className="hidden sm:inline">{t.catalog.sortBy}</span>
        <select
          value={sort}
          onChange={(e) => update((p) => p.set("tri", e.target.value))}
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink outline-none focus:border-accent"
        >
          {SORT_KEYS.filter((k) => k !== "pertinence" || hasQuery).map((k) => (
            <option key={k} value={k}>{t.catalog.sorts[k]}</option>
          ))}
        </select>
      </label>

      <div className="flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label={t.catalog.display}>
        {([["grille", LayoutGrid, t.catalog.grid], ["liste", List, t.catalog.list]] as const).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            aria-label={label}
            aria-pressed={view === v}
            onClick={() => update((p) => (v === "liste" ? p.set("vue", "liste") : p.delete("vue")), { keepPage: true })}
            className={cn("grid size-9 place-items-center rounded-md transition", view === v ? "bg-ink text-white" : "text-steel hover:text-ink")}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      <MobileFilters open={open} onClose={() => setOpen(false)} total={total}>
        <FilterPanel facets={facets} />
      </MobileFilters>
    </div>
  );
}

function MobileFilters({ open, onClose, total, children }: { open: boolean; onClose: () => void; total: number; children: ReactNode }) {
  const { t, plural, dir } = useI18n();
  const rtl = dir === "rtl";
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div dir={dir}>
          <motion.div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t.catalog.filters}
            className="fixed inset-y-0 start-0 z-50 flex h-dvh w-[min(90vw,380px)] flex-col bg-white shadow-2xl lg:hidden"
            initial={{ x: rtl ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: rtl ? "100%" : "-100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <p className="font-display text-lg font-semibold">{t.catalog.filters}</p>
              <button type="button" onClick={onClose} aria-label={t.common.close} className="grid size-10 place-items-center rounded-lg hover:bg-mist">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
            <div className="border-t border-line p-4">
              <button type="button" onClick={onClose} className="h-12 w-full rounded-lg bg-accent font-medium text-white hover:bg-accent-hover">
                {plural(t.catalog.show, total)}
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ─── Panneau de filtres ─────────────────────────────────────────────── */

export function FilterPanel({ facets }: { facets: Facets }) {
  const { t, fmt, unit } = useI18n();
  const { params, update } = useUpdateParams();
  const selectedBrands = new Set((params.get("marque") ?? "").split(",").filter(Boolean));
  const inStock = params.get("stock") === "1";
  const hasFilters = [...params.keys()].some((k) => k === "marque" || k === "prix" || k === "stock" || k.startsWith("f_"));

  const toggleBrand = (slug: string) =>
    update((p) => {
      const next = new Set(selectedBrands);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      if (next.size) p.set("marque", [...next].join(","));
      else p.delete("marque");
    });

  return (
    <div className="space-y-7">
      {hasFilters && (
        <button
          type="button"
          onClick={() => update((p) => [...p.keys()].filter((k) => k === "marque" || k === "prix" || k === "stock" || k.startsWith("f_")).forEach((k) => p.delete(k)))}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
        >
          <X className="size-4" /> {t.catalog.clearFilters}
        </button>
      )}

      <FilterGroup title={t.catalog.availability}>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-graphite">
          <Checkbox checked={inStock} onChange={() => update((p) => (inStock ? p.delete("stock") : p.set("stock", "1")))} />
          {t.catalog.inStockOnly}
        </label>
      </FilterGroup>

      {facets.brands.length > 0 && (
        <FilterGroup title={t.catalog.brand}>
          <ul className="space-y-2">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-graphite">
                  <Checkbox checked={selectedBrands.has(b.slug)} onChange={() => toggleBrand(b.slug)} />
                  <span className="flex-1">{b.name}</span>
                  <span className="text-xs text-steel">{b.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </FilterGroup>
      )}

      {facets.price && (
        <FilterGroup title={fmt(t.catalog.price, { cur: t.common.currency })}>
          <RangeInputs
            paramKey="prix"
            min={facets.price.min}
            max={facets.price.max}
            value={params.get("prix")}
            onApply={(v) => update((p) => (v ? p.set("prix", v) : p.delete("prix")))}
          />
        </FilterGroup>
      )}

      {facets.attributes.map((a) => (
        <FilterGroup key={a.key} title={a.unit ? fmt(t.catalog.inUnit, { label: a.label, unit: unit(a.unit) }) : a.label}>
          <RangeInputs
            paramKey={`f_${a.key}`}
            min={a.min}
            max={a.max}
            value={params.get(`f_${a.key}`)}
            onApply={(v) => update((p) => (v ? p.set(`f_${a.key}`, v) : p.delete(`f_${a.key}`)))}
          />
        </FilterGroup>
      ))}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-semibold tracking-wider text-steel uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span className="relative grid size-5 shrink-0 place-items-center">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer absolute inset-0 cursor-pointer opacity-0" />
      <span className="size-5 rounded-md border border-line bg-white transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
      <Check className="pointer-events-none absolute size-3.5 text-white opacity-0 transition peer-checked:opacity-100" strokeWidth={3} />
    </span>
  );
}

/** Deux champs min / max, appliqués à la validation (Entrée ou bouton). */
function RangeInputs({ paramKey, min, max, value, onApply }: { paramKey: string; min: number; max: number; value: string | null; onApply: (v: string | null) => void }) {
  const { t } = useI18n();
  const [a, b] = (value ?? "").split("-");
  const [lo, setLo] = useState(a ?? "");
  const [hi, setHi] = useState(b ?? "");
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setLo(a ?? "");
    setHi(b ?? "");
  }
  const apply = () => {
    const clean = (s: string) => s.replace(",", ".").replace(/[^\d.]/g, "");
    const l = clean(lo);
    const h = clean(hi);
    onApply(l || h ? `${l}-${h}` : null);
  };
  const field = "h-10 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <input aria-label={t.catalog.min} name={`${paramKey}-min`} inputMode="decimal" placeholder={fmt(min)} value={lo} onChange={(e) => setLo(e.target.value)} className={field} />
      <span className="text-steel">–</span>
      <input aria-label={t.catalog.max} name={`${paramKey}-max`} inputMode="decimal" placeholder={fmt(max)} value={hi} onChange={(e) => setHi(e.target.value)} className={field} />
      <button type="submit" aria-label={t.catalog.apply} className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink text-white hover:bg-graphite">
        <Check className="size-4" />
      </button>
    </form>
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
