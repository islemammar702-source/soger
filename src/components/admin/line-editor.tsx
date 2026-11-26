"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { documentTotals } from "@/lib/totals";
import { cn, formatTND } from "@/lib/utils";

export type EditorLine = { productId: number | null; sku: string | null; description: string; quantity: number; unitPrice: number; discountRate: number; vatRate: number };
export type ProductHit = { id: number; sku: string; name: string; unit: string; vatRate: number; price: number | null; cost: number | null; available: number; exact: boolean };

/** Recherche produit (référence, nom, code-barres) avec navigation clavier. */
export function ProductPicker({ onPick, customerId, placeholder = "Ajouter un produit : référence, nom ou code-barres…", autoFocus, inputRef }: { onPick: (p: ProductHit) => void; customerId?: number | null; placeholder?: string; autoFocus?: boolean; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [active, setActive] = useState(0);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/admin/api/produits?q=${encodeURIComponent(term)}${customerId ? `&client=${customerId}` : ""}`, { signal: ctrl.signal });
        if (res.ok) {
          setHits((await res.json()).items);
          setActive(0);
        }
      } catch {}
    }, 150);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, customerId]);

  const pick = (p: ProductHit) => {
    onPick(p);
    setQ("");
    setHits([]);
    ref.current?.focus();
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" />
      <input
        ref={ref}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) setHits([]);
        }}
        onKeyDown={async (e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          if (e.key === "Escape") setHits([]);
          if (e.key === "Enter") {
            e.preventDefault();
            // Lecteur code-barres : saisie + Entrée immédiate → recherche exacte.
            if (hits[active]) return pick(hits[active]);
            const term = q.trim();
            if (!term) return;
            const res = await fetch(`/admin/api/produits?q=${encodeURIComponent(term)}${customerId ? `&client=${customerId}` : ""}`);
            const items: ProductHit[] = res.ok ? (await res.json()).items : [];
            const exact = items.find((i) => i.exact) ?? (items.length === 1 ? items[0] : null);
            if (exact) pick(exact);
            else setHits(items);
          }
        }}
        placeholder={placeholder}
        aria-label="Rechercher un produit"
        className="h-11 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
      />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lift" role="listbox">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} onMouseEnter={() => setActive(i)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm", i === active && "bg-mist")}>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{h.name}</span><span className="font-mono text-xs text-steel">{h.sku}</span></span>
                <span className={cn("text-xs", h.available <= 0 ? "text-danger" : "text-steel")}>stock {h.available}</span>
                <span className="w-24 text-right text-xs font-semibold">{h.price == null ? "sur devis" : formatTND(h.price)}</span>
              </button>
            </li>
          ))}
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
