"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Building2, Check, CheckCircle2, Link2, Loader2, PackagePlus, Plus, ReceiptText, Search, Trash2, Wallet, X } from "lucide-react";
import { checkDuplicateAction, quickCreateProductAction, saveSupplierInvoiceAction, searchSuppliersAction, supplierPurchaseOrdersAction, type InvoiceDraft, type SupplierOption } from "@/server/admin/supplier-invoices";
import { documentTotals, round3 } from "@/lib/totals";
import { cn, formatTND } from "@/lib/utils";
import { ProductPicker, type ProductHit } from "./line-editor";

type Line = InvoiceDraft["lines"][number] & { key: string };
type Perms = { canPay: boolean; canStock: boolean; canCreateProduct: boolean; canCreateSupplier: boolean };
const VAT = [19, 13, 7, 0];
const METHODS: [string, string][] = [["transfer", "Virement"], ["check", "Chèque"], ["cash", "Espèces"], ["card", "Carte"], ["other", "Autre"]];
const TYPES: [string, string, string][] = [
  ["stock", "Marchandises — entrée en stock", "Les quantités des produits associés entrent dans le stock à l'enregistrement."],
  ["received", "Marchandises déjà réceptionnées", "Le stock a déjà été mis à jour par un bon de réception : aucun mouvement de stock."],
  ["expense", "Frais / services", "Transport, entretien, prestations… : aucun mouvement de stock."],
];
let seq = 0;
const key = () => `l${++seq}`;
const num = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const field = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";
const cell = "h-9 w-full rounded-md border border-line bg-white px-2 text-sm outline-none focus:border-accent";


/** Formulaire facture fournisseur : saisie manuelle, ou vérification d'une facture lue automatiquement. */
export function SupplierInvoiceForm({ draft, perms, sourceFileId = null, raw, duplicate: initialDuplicate = null }: { draft: InvoiceDraft; perms: Perms; sourceFileId?: number | null; raw?: unknown; duplicate?: string | null }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(draft.supplier);
  const [supQ, setSupQ] = useState("");
  const [supHits, setSupHits] = useState<SupplierOption[]>([]);
  const [ref, setRef] = useState(draft.externalRef);
  const [issueDate, setIssueDate] = useState(draft.issueDate);
  const [dueDate, setDueDate] = useState(draft.dueDate);
  const [type, setType] = useState<"stock" | "received" | "expense">(perms.canStock ? "stock" : "received");
  const [pos, setPos] = useState<{ id: number; number: string; status: string; total: string }[]>([]);
  const [poId, setPoId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>(draft.lines.map((l) => ({ ...l, key: key() })));
  const [stamp, setStamp] = useState(draft.stampDuty);
  const [paidStr, setPaidStr] = useState(draft.amountPaid ? String(draft.amountPaid) : "0");
  const [method, setMethod] = useState(draft.paymentMethod || "transfer");
  const [payRef, setPayRef] = useState("");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [notes, setNotes] = useState("");
  const [assoc, setAssoc] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ key: string; sku: string; name: string } | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(initialDuplicate);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  const t = documentTotals(lines, { stampDuty: stamp });
  const paid = round3(num(paidStr));
  const remaining = round3(Math.max(0, t.total - paid));
  const status = paid <= 0.0005 ? "Non payée" : remaining <= 0.0005 ? "Payée" : "Partiellement payée";
  const printedTTC = draft.printed?.totalTTC ?? null;
  const gap = printedTTC != null ? round3(t.total - printedTTC) : null;
  const unmatched = lines.filter((l) => !l.productId).length;
  const probable = lines.filter((l) => l.match === "probable").length;

  // Recherche fournisseur.
  useEffect(() => {
    if (supQ.trim().length < 2) return;
    let alive = true;
    const tm = setTimeout(() => searchSuppliersAction(supQ).then((r) => alive && setSupHits(r)), 150);
    return () => { alive = false; clearTimeout(tm); };
  }, [supQ]);
  // Bons de commande du fournisseur (rattachement facultatif).
  useEffect(() => {
    let alive = true;
    if (supplier.id) supplierPurchaseOrdersAction(supplier.id).then((r) => alive && setPos(r));
    return () => { alive = false; };
  }, [supplier.id]);
  const recheckDuplicate = () => {
    if (!ref.trim() || !supplier.name.trim()) return setDuplicate(null);
    checkDuplicateAction(supplier.id, supplier.name, ref).then(setDuplicate);
  };

  const upd = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const fromProduct = (p: ProductHit): Partial<Line> => ({ productId: p.id, match: "exact", sku: p.sku, manufacturerRef: p.manufacturerRef ?? "", brand: p.brand ?? "", vatRate: VAT.includes(p.vatRate) ? p.vatRate : 19 });
  const addProduct = (p: ProductHit) =>
    setLines((ls) => [...ls, { key: key(), supplierRef: "", description: p.name, quantity: 1, unitPrice: p.cost ?? 0, discountRate: 0, printedTotal: null, ...fromProduct(p) } as Line]);
  const addFree = () => setLines((ls) => [...ls, { key: key(), productId: null, match: null, sku: "", supplierRef: "", manufacturerRef: "", brand: "", description: "", quantity: 1, unitPrice: 0, discountRate: 0, vatRate: 19, printedTotal: null }]);

  const createProduct = async () => {
    if (!creating) return;
    const l = lines.find((x) => x.key === creating.key);
    if (!l) return;
    setBusy(true);
    const r = await quickCreateProductAction({ sku: creating.sku, name: creating.name, manufacturerRef: l.manufacturerRef, brand: l.brand, purchasePrice: round3(l.unitPrice * (1 - l.discountRate / 100)), vatRate: l.vatRate as 0 | 7 | 13 | 19 });
    setBusy(false);
    if (!r.ok) return setError({ message: r.message });
    upd(creating.key, { productId: r.product.productId, sku: r.product.sku, match: "exact" });
    setCreating(null);
    setError(null);
  };

  const validationError = (): string | null => {
    if (!supplier.name.trim()) return "Indiquez le fournisseur.";
    if (!supplier.id && !perms.canCreateSupplier) return "Sélectionnez un fournisseur existant (votre rôle ne permet pas d'en créer).";
    if (!ref.trim()) return "Indiquez le numéro de la facture.";
    if (!issueDate) return "Indiquez la date de la facture.";
    if (!lines.length) return "Ajoutez au moins une ligne.";
    const bad = lines.findIndex((l) => !l.description.trim() || !(l.quantity > 0));
    if (bad >= 0) return `Ligne ${bad + 1} : désignation et quantité obligatoires.`;
    if (paid > t.total + 0.0005) return "Le montant payé dépasse le total de la facture.";
    if (duplicate) return `Facture déjà enregistrée (${duplicate}).`;
    return null;
  };

  const save = () => {
    setError(null);
    start(async () => {
      const r = await saveSupplierInvoiceAction({
        sourceFileId,
        extracted: raw,
        supplier: { id: supplier.id, name: supplier.name, taxId: supplier.taxId, address: supplier.address },
        externalRef: ref,
        issueDate,
        dueDate,
        purchaseType: type,
        purchaseOrderId: poId,
        lines: lines.map((l) => ({ productId: l.productId, supplierRef: l.supplierRef, manufacturerRef: l.manufacturerRef, brand: l.brand, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountRate: l.discountRate, vatRate: l.vatRate as 0 | 7 | 13 | 19 })),
        stampDuty: stamp,
        payment: { amount: paid, method: method as "transfer", reference: payRef },
        updateCosts,
        notes,
      });
      if (r.ok) router.push(`/admin/factures/${r.id}?ok=${encodeURIComponent(`Facture ${r.number} enregistrée`)}`);
      else {
        setConfirming(false);
        setError({ message: r.message, field: r.field });
      }
    });
  };

  const stockCount = type === "stock" ? lines.filter((l) => l.productId).length : 0;

  return (
    // Grilles pilotées par la largeur réelle du formulaire (plus étroit quand l'aperçu de la facture est affiché à côté).
    <div className="@container space-y-5">
      {draft.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Points à vérifier</p>
          <ul className="list-disc space-y-0.5 pl-5">{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {/* 1. Informations générales */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-accent" /> 1. Informations générales</h2>
        <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-4">
          <label className="block text-sm @xl:col-span-2">
            <span className="mb-1 block font-medium">Fournisseur</span>
            {supplier.id ? (
              <span className="flex h-10 items-center gap-2 rounded-lg border border-accent bg-accent-soft/30 px-3">
                <Check className="size-4 text-accent" /><strong className="flex-1 truncate">{supplier.name}</strong>
                {supplier.how && <span className="text-xs text-steel">reconnu par {supplier.how === "taxId" ? "matricule" : "nom"}</span>}
                <button type="button" aria-label="Changer de fournisseur" onClick={() => { setSupplier({ id: null, name: "", taxId: "", address: "", how: null }); setPoId(null); setPos([]); }} className="text-steel hover:text-danger"><X className="size-4" /></button>
              </span>
            ) : (
              <span className="relative block">
                <input
                  value={supplier.name}
                  onChange={(e) => { setSupplier((s) => ({ ...s, name: e.target.value })); setSupQ(e.target.value); if (e.target.value.trim().length < 2) setSupHits([]); }}
                  onBlur={() => setTimeout(() => { setSupHits([]); recheckDuplicate(); }, 150)}
                  placeholder="Rechercher ou saisir le nom du fournisseur"
                  aria-label="Fournisseur"
                  className={cn(field, error?.field?.startsWith("supplier") && "border-danger")}
                />
                {supHits.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lift">
                    {supHits.map((s) => (
                      <li key={s.id}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setSupplier({ id: s.id, name: s.name, taxId: s.taxId ?? supplier.taxId, address: s.address ?? supplier.address, how: null }); setSupHits([]); setTimeout(recheckDuplicate, 0); }} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-mist">
                          <span><strong>{s.name}</strong> <span className="font-mono text-xs text-steel">{s.code}</span></span>
                          <span className="text-xs text-steel">{s.taxId}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {supplier.name.trim().length >= 2 && supHits.length === 0 && <span className="mt-1 block text-xs text-steel">{perms.canCreateSupplier ? "Nouveau fournisseur : il sera créé à l'enregistrement." : "Sélectionnez un fournisseur existant dans la liste."}</span>}
              </span>
            )}
          </label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Matricule fiscal</span><input value={supplier.taxId} onChange={(e) => setSupplier((s) => ({ ...s, taxId: e.target.value }))} className={cn(field, "font-mono")} aria-label="Matricule fiscal" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Adresse du fournisseur</span><input value={supplier.address} onChange={(e) => setSupplier((s) => ({ ...s, address: e.target.value }))} className={field} aria-label="Adresse du fournisseur" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">N° de facture</span><input value={ref} onChange={(e) => setRef(e.target.value)} onBlur={recheckDuplicate} className={cn(field, "font-mono", (duplicate || error?.field === "externalRef") && "border-danger")} aria-label="Numéro de facture" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Date de facture</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={field} aria-label="Date de facture" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Date d&apos;échéance <span className="font-normal text-steel">(sinon : délai du fournisseur)</span></span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} aria-label="Date d'échéance" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Type de facture</span>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={field} aria-label="Type de facture">
              {TYPES.filter(([k]) => k !== "stock" || perms.canStock).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {pos.length > 0 && (
            <label className="block text-sm @xl:col-span-2"><span className="mb-1 block font-medium">Bon de commande <span className="font-normal text-steel">(facultatif)</span></span>
              <select value={poId ?? ""} onChange={(e) => setPoId(Number(e.target.value) || null)} className={field} aria-label="Bon de commande">
                <option value="">— Aucun —</option>
                {pos.map((p) => <option key={p.id} value={p.id}>{p.number} · {formatTND(p.total)} · {p.status}</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="mt-3 text-xs text-steel">{TYPES.find(([k]) => k === type)?.[2]}</p>
        {duplicate && <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger"><AlertTriangle className="size-4" /> Cette facture est déjà enregistrée : {duplicate}. Enregistrement bloqué.</p>}
      </section>

      {/* 2. Produits */}
      <section className="rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="size-4 text-accent" /> 2. Produits facturés</h2>
          {lines.length > 0 && (
            <p className="text-xs text-steel">
              {lines.length - unmatched} associé(s) à un produit SOGER{probable > 0 && <span className="text-amber-700"> · {probable} à confirmer</span>}{unmatched > 0 && <span className="text-amber-700"> · {unmatched} non associé(s){type === "stock" ? " (hors stock)" : ""}</span>}
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-mist/60 text-xs text-steel uppercase">
              <tr>
                <th className="p-2 text-left">Produit</th><th className="w-36 p-2 text-left">Réf. SOGER</th><th className="w-32 p-2 text-left">Réf. fabricant</th><th className="w-28 p-2 text-left">Marque</th>
                <th className="w-20 p-2 text-right">Qté</th><th className="w-28 p-2 text-right">PU achat HT</th><th className="w-20 p-2 text-right">Remise %</th><th className="w-20 p-2 text-right">TVA %</th>
                <th className="w-28 p-2 text-right">Total HT</th><th className="w-28 p-2 text-right">Total TTC</th><th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-steel">Aucune ligne. Recherchez un produit du catalogue ci-dessous, ou ajoutez une ligne libre.</td></tr>}
              {lines.map((l, i) => {
                const tl = t.lines[i];
                const off = l.printedTotal != null && tl && Math.abs(tl.net - l.printedTotal) > 0.01;
                return (
                  <FragmentRow key={l.key}>
                    <tr className={cn("border-t border-line align-top", l.match === "probable" && "bg-amber-50/40")} data-testid="invoice-line">
                      <td className="p-2">
                        <input value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} className={cell} aria-label={`Désignation ligne ${i + 1}`} />
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {l.productId ? (
                            <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5", l.match === "probable" ? "bg-amber-100 text-amber-800" : "bg-accent-soft text-accent-hover")}>
                              <Link2 className="size-3" /> {l.match === "probable" ? "Correspondance probable — vérifiez" : "Produit SOGER associé"}
                            </span>
                          ) : <span className="rounded bg-mist px-1.5 py-0.5 text-steel">Non associé</span>}
                          {l.match === "probable" && <button type="button" onClick={() => upd(l.key, { match: "exact" })} className="font-medium text-accent">Confirmer</button>}
                          <button type="button" onClick={() => { setAssoc(assoc === l.key ? null : l.key); setCreating(null); }} className="font-medium text-accent">{l.productId ? "Changer" : "Associer"}</button>
                          {l.productId && <button type="button" onClick={() => upd(l.key, { productId: null, match: null, sku: "" })} className="text-steel hover:text-danger">Dissocier</button>}
                          {!l.productId && perms.canCreateProduct && <button type="button" onClick={() => { setCreating({ key: l.key, sku: (l.manufacturerRef || l.supplierRef).toUpperCase().replace(/[^A-Z0-9._\-/]/g, "").slice(0, 60), name: l.description }); setAssoc(null); }} className="inline-flex items-center gap-1 font-medium text-accent"><PackagePlus className="size-3" /> Créer le produit</button>}
                          {l.supplierRef && <span className="text-steel">Réf. facture : <span className="font-mono">{l.supplierRef}</span></span>}
                        </div>
                      </td>
                      <td className="p-2 pt-4 font-mono text-xs">{l.sku || "—"}</td>
                      <td className="p-2"><input value={l.manufacturerRef} onChange={(e) => upd(l.key, { manufacturerRef: e.target.value })} className={cn(cell, "font-mono text-xs")} aria-label={`Référence fabricant ligne ${i + 1}`} /></td>
                      <td className="p-2"><input value={l.brand} onChange={(e) => upd(l.key, { brand: e.target.value })} className={cell} aria-label={`Marque ligne ${i + 1}`} /></td>
                      <td className="p-2"><NumInput value={l.quantity} onChange={(v) => upd(l.key, { quantity: v })} label={`Quantité ligne ${i + 1}`} /></td>
                      <td className="p-2"><NumInput value={l.unitPrice} onChange={(v) => upd(l.key, { unitPrice: v })} label={`Prix d'achat ligne ${i + 1}`} /></td>
                      <td className="p-2"><NumInput value={l.discountRate} onChange={(v) => upd(l.key, { discountRate: Math.min(100, v) })} label={`Remise ligne ${i + 1}`} /></td>
                      <td className="p-2"><select value={l.vatRate} onChange={(e) => upd(l.key, { vatRate: Number(e.target.value) })} className={cn(cell, "text-right")} aria-label={`TVA ligne ${i + 1}`}>{VAT.map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                      <td className="p-2 pt-4 text-right tabular-nums">{formatTND(tl?.net ?? 0)}{off && <span className="block text-[11px] text-amber-700" title="Montant imprimé sur la facture">facture : {formatTND(l.printedTotal!)}</span>}</td>
                      <td className="p-2 pt-4 text-right font-semibold tabular-nums">{formatTND(tl?.total ?? 0)}</td>
                      <td className="p-2 pt-3"><button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Supprimer la ligne ${i + 1}`} className="grid size-8 place-items-center rounded-md text-steel hover:bg-red-50 hover:text-danger"><Trash2 className="size-4" /></button></td>
                    </tr>
                    {assoc === l.key && (
                      <tr className="bg-mist/50"><td colSpan={11} className="p-3">
                        <p className="mb-2 text-xs text-steel">Associer « {l.description || "ligne " + (i + 1)} » à un produit SOGER existant :</p>
                        <ProductPicker autoFocus onPick={(p) => { upd(l.key, fromProduct(p)); setAssoc(null); }} placeholder="Nom, référence SOGER ou référence fabricant…" />
                      </td></tr>
                    )}
                    {creating?.key === l.key && (
                      <tr className="bg-mist/50"><td colSpan={11} className="p-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs"><span className="mb-1 block font-medium">Nouvelle référence SOGER</span><input autoFocus value={creating.sku} onChange={(e) => setCreating({ ...creating, sku: e.target.value })} className={cn(cell, "w-48 font-mono uppercase")} aria-label="Nouvelle référence SOGER" /></label>
                          <label className="min-w-64 flex-1 text-xs"><span className="mb-1 block font-medium">Désignation</span><input value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} className={cell} aria-label="Désignation du nouveau produit" /></label>
                          <button type="button" onClick={createProduct} disabled={busy} className="h-9 rounded-lg bg-ink px-3 text-sm font-medium text-white disabled:opacity-50">{busy ? "Création…" : "Créer et associer"}</button>
                          <button type="button" onClick={() => setCreating(null)} className="h-9 px-2 text-sm text-steel">Annuler</button>
                        </div>
                        <p className="mt-2 text-xs text-steel">Fiche créée en brouillon (non visible sur le site, sans prix de vente) avec la référence fabricant, la marque, la TVA et le prix d&apos;achat de la ligne. Complétez-la ensuite dans Produits.</p>
                      </td></tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
          <div className="min-w-72 flex-1"><ProductPicker inputRef={addRef} onPick={addProduct} placeholder="Ajouter un produit du catalogue : nom ou référence…" /></div>
          <button type="button" onClick={addFree} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:bg-mist"><Plus className="size-4" /> Ligne libre</button>
        </div>
      </section>

      <div className="grid gap-5 @4xl:grid-cols-2">
        {/* 3. Totaux */}
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">3. Totaux</h2>
          <dl className="space-y-1.5 text-sm">
            <Row k="Total brut HT" v={formatTND(t.subtotal)} />
            {t.discountTotal > 0 && <Row k="Remises" v={`−${formatTND(t.discountTotal)}`} />}
            <Row k="Total HT" v={formatTND(t.netTotal)} />
            {t.vatBreakdown.map((v) => <Row key={v.rate} k={`TVA ${v.rate} % sur ${formatTND(v.base)}`} v={formatTND(v.vat)} />)}
            <div className="flex items-center justify-between"><dt className="text-steel">Droit de timbre</dt><dd className="w-28"><NumInput value={stamp} onChange={setStamp} label="Droit de timbre" /></dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total TTC</dt><dd className="tabular-nums" data-testid="total-ttc">{formatTND(t.total)}</dd></div>
            {printedTTC != null && (
              <p className={cn("mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs", Math.abs(gap!) <= 0.01 ? "bg-accent-soft/60 text-accent-hover" : "bg-amber-50 text-amber-800")}>
                {Math.abs(gap!) <= 0.01 ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                Total imprimé sur la facture : {formatTND(printedTTC)}{Math.abs(gap!) > 0.01 && ` — écart de ${formatTND(gap!)} : vérifiez les lignes.`}
              </p>
            )}
          </dl>
        </section>

        {/* 4. Paiement */}
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Wallet className="size-4 text-accent" /> 4. Paiement</h2>
          {perms.canPay ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setPaidStr("0")} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", paid <= 0.0005 ? "border-accent bg-accent-soft/40 text-accent-hover" : "border-line")}>Non payée</button>
                <button type="button" onClick={() => setPaidStr(String(t.total))} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", paid > 0 && remaining <= 0.0005 ? "border-accent bg-accent-soft/40 text-accent-hover" : "border-line")}>Payée en totalité</button>
              </div>
              <div className="grid gap-3 @lg:grid-cols-3">
                <label className="block text-sm"><span className="mb-1 block font-medium">Montant payé</span><input value={paidStr} onChange={(e) => setPaidStr(e.target.value)} inputMode="decimal" className={cn(field, "text-right tabular-nums", error?.field === "payment.amount" && "border-danger")} aria-label="Montant payé" /></label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Mode de paiement</span><select value={method} onChange={(e) => setMethod(e.target.value)} className={field} aria-label="Mode de paiement" disabled={paid <= 0}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Réf. (chèque, virement)</span><input value={payRef} onChange={(e) => setPayRef(e.target.value)} className={field} aria-label="Référence du paiement" disabled={paid <= 0} /></label>
              </div>
            </>
          ) : <p className="text-sm text-steel">Votre rôle ne permet pas d&apos;enregistrer de paiement : la facture sera enregistrée « non payée ».</p>}
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <Row k="Montant payé" v={formatTND(Math.min(paid, t.total))} />
            <div className={cn("flex justify-between font-semibold", remaining > 0.0005 && "text-amber-700")}><dt>Reste à payer (dette fournisseur)</dt><dd className="tabular-nums">{formatTND(remaining)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">Statut</dt><dd><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status === "Payée" ? "bg-accent-soft text-accent-hover" : status === "Non payée" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")} data-testid="pay-status">{status}</span></dd></div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-line bg-white p-5">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={updateCosts} onChange={(e) => setUpdateCosts(e.target.checked)} disabled={type === "expense"} className="mt-0.5 size-4 accent-[var(--color-accent)]" /> <span>Mettre à jour le prix d&apos;achat des produits associés et la référence chez ce fournisseur <span className="text-steel">(prix net après remise)</span></span></label>
        <label className="mt-3 block text-sm"><span className="mb-1 block font-medium">Notes <span className="font-normal text-steel">(facultatif)</span></span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" aria-label="Notes" /></label>
      </section>

      {/* 5. Confirmation (validation humaine obligatoire) */}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error.message}</p>}
      {confirming ? (
        <div className="rounded-xl border-2 border-accent bg-white p-5" data-testid="confirm-box">
          <h2 className="mb-2 font-semibold">Confirmer l&apos;enregistrement</h2>
          <ul className="space-y-1 text-sm">
            <li>Facture <strong className="font-mono">{ref}</strong> de <strong>{supplier.name}</strong>{supplier.id ? "" : " (nouveau fournisseur)"}, du {issueDate}</li>
            <li>{lines.length} ligne(s) · total TTC <strong>{formatTND(t.total)}</strong></li>
            <li>{stockCount > 0 ? <>Entrée en stock de <strong>{stockCount}</strong> produit(s) au dépôt principal</> : "Aucun mouvement de stock"}</li>
            <li>{paid > 0 ? <>Paiement de <strong>{formatTND(paid)}</strong> ({METHODS.find(([k]) => k === method)?.[1]}) · reste {formatTND(remaining)}</> : <>Aucun paiement · dette fournisseur {formatTND(t.total)}</>}</li>
            {unmatched > 0 && type === "stock" && <li className="text-amber-700">{unmatched} ligne(s) non associée(s) n&apos;entreront pas en stock.</li>}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={save} disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirmer et enregistrer</button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="h-11 rounded-lg border border-line px-4 text-sm font-medium">Revenir aux corrections</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-steel">Rien n&apos;est enregistré tant que vous n&apos;avez pas confirmé.</p>
          <button
            type="button"
            onClick={() => {
              const v = validationError();
              if (v) return setError({ message: v });
              setError(null);
              setConfirming(true);
            }}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white hover:bg-accent-hover"
          >
            <Search className="size-4" /> Vérifier et enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-steel">{k}</dt><dd className="tabular-nums">{v}</dd></div>;
}
/** Champ numérique tolérant (virgule ou point), sans perdre la saisie en cours. */
function NumInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={focused ? text : String(value)}
      onFocus={(e) => { setText(String(value)); setFocused(true); e.target.select(); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => { setText(e.target.value); onChange(Math.max(0, num(e.target.value))); }}
      inputMode="decimal"
      aria-label={label}
      className={cn(cell, "text-right tabular-nums")}
    />
  );
}
