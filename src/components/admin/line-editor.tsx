"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Loader2, Package, Plus, Search, Trash2 } from "lucide-react";
import { documentTotals, round3 } from "@/lib/totals";
import { cn, formatTND, isOptimizable } from "@/lib/utils";

export type EditorLine = { productId: number | null; sku: string | null; description: string; quantity: number; unitPrice: number; discountRate: number; vatRate: number };
export type ProductHit = { id: number; sku: string; name: string; unit: string; vatRate: number; price: number | null; cost: number | null; available: number; exact: boolean; manufacturerRef?: string | null; brand?: string | null; imageUrl?: string | null };

export type PickVia = "enter" | "tab" | "click";

/** Cache partagé des recherches (évite de relancer une requête identique). */
const searchCache = new Map<string, { at: number; items: ProductHit[] }>();
const CACHE_MS = 30_000;

async function searchProducts(term: string, customerId: number | null | undefined, signal?: AbortSignal) {
  const key = `${customerId ?? 0}|${term.toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  const res = await fetch(`/admin/api/produits?q=${encodeURIComponent(term)}${customerId ? `&client=${customerId}` : ""}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const items: ProductHit[] = (await res.json()).items;
  searchCache.set(key, { at: Date.now(), items });
  if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value!);
  return items;
}

/** Met en évidence les mots tapés dans un texte. */
function Mark({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-amber-100 px-0 text-inherit">{part}</mark> : part))}</>;
}

/**
 * Recherche produit au clavier (nom, référence SOGER, référence fabricant) avec suggestions instantanées.
 * Aucun matériel requis ; si un code-barres est renseigné sur la fiche, il est aussi reconnu, sans être obligatoire.
 * Clavier : ↑/↓ parcourir · Entrée choisir · Tab choisir puis passer à la quantité (si `onPick` le gère) · Échap fermer.
 * Entrée tapée avant l'affichage des suggestions : recherche immédiate, ajout direct si une seule référence correspond.
 */
export function ProductPicker({ onPick, customerId, placeholder = "Ajouter un produit : nom ou référence…", autoFocus, inputRef, tabSelects = false, showStock = true }: { onPick: (p: ProductHit, via: PickVia) => void; customerId?: number | null; placeholder?: string; autoFocus?: boolean; inputRef?: React.RefObject<HTMLInputElement | null>; tabSelects?: boolean; showStock?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const [active, setActive] = useState(0);
  const localRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const ref = inputRef ?? localRef;
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    // Délai court : on n'interroge le serveur que lorsque la frappe marque une pause (120 ms).
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await searchProducts(term, customerId, ctrl.signal);
        setHits(items);
        setSearched(term);
        setActive(0);
        setOpen(true);
      } catch {
        /* requête annulée ou échouée : on garde l'affichage précédent */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [term, customerId]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => {
    setOpen(false);
    setHits([]);
  };
  const pick = (p: ProductHit, via: PickVia) => {
    setQ("");
    close();
    onPick(p, via);
    if (via !== "tab") ref.current?.focus();
  };
  const terms = searched.toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  const showList = open && term.length >= 2 && (hits.length > 0 || (!loading && searched === term));

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" />
      <input
        ref={ref}
        value={q}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        aria-controls="product-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? `product-option-${hits[active].id}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) close();
        }}
        onFocus={() => { if (hits.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={async (e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(hits.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Escape") { if (showList) { e.stopPropagation(); close(); } }
          else if (e.key === "Tab" && tabSelects && showList && hits[active] && !e.shiftKey) { e.preventDefault(); pick(hits[active], "tab"); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (!term) return;
            // Résultats à jour pour ce texte : on prend la suggestion surlignée.
            if (showList && searched === term && hits[active]) return pick(hits[active], "enter");
            // Sinon (Entrée tapée très vite) : recherche immédiate.
            setLoading(true);
            try {
              const items = await searchProducts(term, customerId);
              const exact = items.find((i) => i.exact) ?? (items.length === 1 ? items[0] : null);
              if (exact) pick(exact, "enter");
              else { setHits(items); setSearched(term); setActive(0); setOpen(true); }
            } catch {} finally { setLoading(false); }
          }
        }}
        placeholder={placeholder}
        aria-label="Rechercher un produit"
        className="h-11 w-full rounded-lg border border-line bg-white pr-9 pl-9 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
      />
      {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-steel" aria-hidden />}
      {showList && (
        <ul ref={listRef} id="product-suggestions" className="absolute inset-x-0 top-full z-30 mt-1 max-h-[26rem] overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lift" role="listbox" aria-label="Suggestions de produits">
          {hits.length === 0 && <li className="px-4 py-3 text-sm text-steel">Aucun produit du catalogue ne correspond à « {searched} ».</li>}
          {hits.map((h, i) => (
            <li key={h.id} id={`product-option-${h.id}`} role="option" aria-selected={i === active} data-index={i}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h, "click")} onMouseMove={() => setActive(i)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm", i === active && "bg-accent-soft/60")}>
                <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-mist">
                  {h.imageUrl ? <Image src={h.imageUrl} alt="" fill sizes="40px" className="object-contain p-0.5" unoptimized={!isOptimizable(h.imageUrl)} /> : <Package className="size-4 text-steel/50" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium"><Mark text={h.name} terms={terms} /></span>
                  <span className="block truncate text-xs text-steel">
                    Réf : <span className="font-mono text-ink"><Mark text={h.sku} terms={terms} /></span>
                    {h.manufacturerRef && <> · Fab : <span className="font-mono"><Mark text={h.manufacturerRef} terms={terms} /></span></>}
                    {h.brand && <> · {h.brand}</>}
                  </span>
                </span>
                {showStock && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", h.available <= 0 ? "bg-red-50 text-danger" : "bg-mist text-steel")}>{h.available <= 0 ? "Rupture" : `Stock ${h.available}`}</span>}
                <span className="w-28 shrink-0 text-right">
                  {h.price == null ? <span className="text-xs text-steel">sur devis</span> : (
                    <>
                      <span className="block font-semibold tabular-nums">{formatTND(round3(h.price * (1 + h.vatRate / 100)))}</span>
                      <span className="block text-[11px] text-steel tabular-nums">{formatTND(h.price)} HT</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
          {hits.length > 0 && <li className="border-t border-line px-3 pt-1.5 pb-1 text-[11px] text-steel">↑ ↓ parcourir · Entrée ajouter{tabSelects ? " · Tab ajouter et saisir la quantité" : ""} · Échap fermer</li>}
        </ul>
      )}
    </div>
  );
}

/** Tableau de lignes éditable (devis, commandes fournisseurs). */
export function LineEditor({ lines, setLines, customerId, mode = "sale" }: { lines: EditorLine[]; setLines: (fn: (l: EditorLine[]) => EditorLine[]) => void; customerId?: number | null; mode?: "sale" | "purchase" }) {
  const t = documentTotals(lines);
  const upd = (i: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const cell = "h-9 w-full rounded-md border border-line bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-accent";
  return (
    <div className="space-y-3">
      <ProductPicker
        customerId={customerId}
        onPick={(p) =>
          setLines((ls) => {
            const existing = ls.findIndex((l) => l.productId === p.id);
            if (existing >= 0) return ls.map((l, j) => (j === existing ? { ...l, quantity: l.quantity + 1 } : l));
            return [...ls, { productId: p.id, sku: p.sku, description: p.name, quantity: 1, unitPrice: (mode === "purchase" ? p.cost : p.price) ?? 0, discountRate: 0, vatRate: p.vatRate }];
          })
        }
      />
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-mist/60 text-xs text-steel uppercase">
            <tr>
              <th className="p-2 text-left">Désignation</th>
              <th className="w-24 p-2 text-right">Qté</th>
              <th className="w-32 p-2 text-right">{mode === "purchase" ? "Coût HT" : "PU HT"}</th>
              {mode === "sale" && <th className="w-24 p-2 text-right">Remise %</th>}
              <th className="w-24 p-2 text-right">TVA %</th>
              <th className="w-32 p-2 text-right">Total HT</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-steel">Aucune ligne. Recherchez un produit ci-dessus{mode === "sale" ? " ou ajoutez une ligne libre" : ""}.</td></tr>}
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className="p-2">
                  <input value={l.description} onChange={(e) => upd(i, { description: e.target.value })} className="h-9 w-full rounded-md border border-transparent px-2 text-sm hover:border-line focus:border-accent focus:outline-none" aria-label="Désignation" />
                  <span className="px-2 font-mono text-xs text-steel">{l.sku ?? "ligne libre"}</span>
                </td>
                <td className="p-2"><input defaultValue={l.quantity} onChange={(e) => upd(i, { quantity: num(e.target.value) })} inputMode="decimal" className={cell} aria-label="Quantité" /></td>
                <td className="p-2"><input defaultValue={l.unitPrice} onChange={(e) => upd(i, { unitPrice: num(e.target.value) })} inputMode="decimal" className={cell} aria-label="Prix unitaire" /></td>
                {mode === "sale" && <td className="p-2"><input defaultValue={l.discountRate} onChange={(e) => upd(i, { discountRate: Math.min(100, num(e.target.value)) })} inputMode="decimal" className={cell} aria-label="Remise" /></td>}
                <td className="p-2">
                  <select value={l.vatRate} onChange={(e) => upd(i, { vatRate: Number(e.target.value) })} className={cell} aria-label="TVA">{[19, 13, 7, 0].map((v) => <option key={v} value={v}>{v}</option>)}</select>
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">{formatTND(t.lines[i]?.net ?? 0)}</td>
                <td className="p-2"><button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Supprimer la ligne" className="grid size-8 place-items-center rounded-md text-steel hover:bg-red-50 hover:text-danger"><Trash2 className="size-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {mode === "sale" ? (
          <button type="button" onClick={() => setLines((ls) => [...ls, { productId: null, sku: null, description: "Prestation / article hors catalogue", quantity: 1, unitPrice: 0, discountRate: 0, vatRate: 19 }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
            <Plus className="size-4" /> Ligne libre
          </button>
        ) : <span />}
        <dl className="w-72 space-y-1.5 rounded-xl border border-line bg-white p-4 text-sm">
          <div className="flex justify-between"><dt className="text-steel">Total brut HT</dt><dd className="tabular-nums">{formatTND(t.subtotal)}</dd></div>
          {t.discountTotal > 0 && <div className="flex justify-between"><dt className="text-steel">Remises</dt><dd className="tabular-nums">-{formatTND(t.discountTotal)}</dd></div>}
          {t.vatBreakdown.map((v) => <div key={v.rate} className="flex justify-between"><dt className="text-steel">TVA {v.rate} %</dt><dd className="tabular-nums">{formatTND(v.vat)}</dd></div>)}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total TTC</dt><dd className="tabular-nums">{formatTND(t.total)}</dd></div>
        </dl>
      </div>
    </div>
  );
}
