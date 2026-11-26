"use client";

import { useEffect, useState } from "react";
import { bulkProductsAction } from "@/server/admin/products";

type Opt = { id: number; name: string };

/** Case « tout cocher » de la page courante. */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Tout sélectionner"
      className="size-4 accent-[var(--color-accent)]"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>('input[form="bulk"][name="ids"]').forEach((c) => {
          c.checked = e.target.checked;
          c.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }}
    />
  );
}

/** Barre d'actions groupées : s'applique aux produits cochés. */
export function BulkBar({ back, canPublish, categories, brands }: { back: string; canPublish: boolean; categories: Opt[]; brands: Opt[] }) {
  const [op, setOp] = useState("");
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(document.querySelectorAll('input[form="bulk"][name="ids"]:checked').length);
    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, []);
  const field = "h-9 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <form
      id="bulk"
      action={bulkProductsAction}
      onSubmit={(e) => {
        if (!count) { e.preventDefault(); alert("Cochez au moins un produit."); return; }
        if (op === "archive" && !confirm(`Archiver ${count} produit(s) ? Ils ne seront plus visibles sur le site mais resteront dans l'historique.`)) e.preventDefault();
      }}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
    >
      <input type="hidden" name="back" value={back} />
      <span className="font-medium">{count} sélectionné(s)</span>
      <select name="op" value={op} onChange={(e) => setOp(e.target.value)} className={field} aria-label="Action groupée">
        <option value="">Action groupée…</option>
        {canPublish && <option value="publish">Publier</option>}
        {canPublish && <option value="unpublish">Dépublier (brouillon)</option>}
        <option value="archive">Archiver</option>
        <option value="restore">Restaurer (archivés → brouillon)</option>
        <option value="activate">Activer (vendable)</option>
        <option value="deactivate">Désactiver</option>
        <option value="category">Changer de catégorie</option>
        <option value="brand">Changer de marque</option>
        <option value="price">Ajuster un prix (%)</option>
        <option value="vat">Changer la TVA</option>
      </select>
      {op === "category" && (
        <select name="categoryId" className={field} aria-label="Nouvelle catégorie" required defaultValue="">
          <option value="" disabled>Catégorie…</option>
          <option value="none">— Sans catégorie —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {op === "brand" && (
        <select name="brandId" className={field} aria-label="Nouvelle marque" required defaultValue="">
          <option value="" disabled>Marque…</option>
          <option value="none">— Sans marque —</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      {op === "price" && (
        <>
          <select name="priceField" className={field} aria-label="Prix concerné"><option value="salePrice">Prix de vente</option><option value="proPrice">Prix professionnel</option></select>
          <input name="pct" required inputMode="decimal" placeholder="+5 ou -10" aria-label="Variation en %" className={`${field} w-28`} />
          <span className="text-steel">%</span>
        </>
      )}
      {op === "vat" && (
        <select name="vatRate" className={field} aria-label="Nouveau taux de TVA">{["19.00", "13.00", "7.00", "0.00"].map((v) => <option key={v} value={v}>{Number(v)} %</option>)}</select>
      )}
      <button disabled={!op} className="h-9 rounded-lg bg-ink px-4 font-medium text-white hover:bg-graphite disabled:opacity-40">Appliquer</button>
    </form>
  );
}
