"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, FileText, HandCoins, Landmark, Loader2, Minus, Package, Plus, Printer, ReceiptText, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { posSaleAction, quickCreateCustomerAction, type SaleResult } from "@/server/admin/pos";
import { documentTotals, round3 } from "@/lib/totals";
import { cn, formatTND, isOptimizable } from "@/lib/utils";
import { CustomerPicker, type CustomerRef } from "./doc-editors";
import { ProductPicker, type ProductHit } from "./line-editor";

type Line = { productId: number; sku: string; name: string; manufacturerRef: string | null; brand: string | null; imageUrl: string | null; quantity: number; unitPrice: number; discountRate: number; vatRate: number; available: number };
type Method = "cash" | "card" | "transfer" | "check";
type Pay = { method: Method; amount: number };
const METHODS: [Method, string, typeof Banknote][] = [["cash", "Espèces", Banknote], ["card", "Carte", CreditCard], ["transfer", "Virement", Landmark], ["check", "Chèque", FileText]];
const label = (m: Method) => METHODS.find((x) => x[0] === m)![1];
const num = (v: string) => Number(v.replace(",", ".")) || 0;

/** Ajout rapide d'un client depuis l'écran de vente. */
function QuickCustomer({ onCreated, onCancel }: { onCreated: (c: CustomerRef) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: "", phone: "", address: "", taxId: "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const field = "h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-accent";
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-line bg-mist/40 p-3">
      <input className={field} placeholder="Nom ou raison sociale *" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Nom ou raison sociale" autoFocus />
      <input className={field} placeholder="Téléphone *" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} aria-label="Téléphone" inputMode="tel" />
      <input className={field} placeholder="Adresse" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} aria-label="Adresse" />
      <input className={field} placeholder="Matricule fiscal (facultatif)" value={v.taxId} onChange={(e) => setV({ ...v, taxId: e.target.value })} aria-label="Matricule fiscal" />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await quickCreateCustomerAction(v);
              if (r.ok) onCreated(r.customer);
              else setError(r.message);
            })
          }
          className="h-9 flex-1 rounded-lg bg-ink text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Création…" : "Créer le client"}
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-line px-3 text-sm">Annuler</button>
      </div>
    </div>
  );
}

export function PosTerminal({ sessionId, canDiscount, canCreateCustomer, initialCustomer }: { sessionId: number; canDiscount: boolean; canCreateCustomer: boolean; initialCustomer: CustomerRef | null }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<CustomerRef | null>(initialCustomer);
  const [creating, setCreating] = useState(false);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [pays, setPays] = useState<Pay[]>([]);
  const [method, setMethod] = useState<Method>("cash");
  const [amount, setAmount] = useState("");
  const [onCredit, setOnCredit] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const effective = lines.map((l) => ({ ...l, discountRate: Math.min(100, Math.max(l.discountRate, globalDiscount)) }));
  const t = documentTotals(effective);
  const paid = round3(pays.reduce((s, p) => s + p.amount, 0));
  const typed = num(amount);
  // Montant en cours de saisie : pris en compte comme paiement à la validation.
  const pending$ = onCredit ? 0 : amount ? typed : pays.length === 0 ? t.total : 0;
  const willPay = round3(paid + pending$);
  const remaining = round3(Math.max(0, t.total - willPay));
  const change = round3(Math.max(0, willPay - t.total));
  const cashIn = pays.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0) + (pending$ && method === "cash" ? pending$ : 0);
  const blocker = !lines.length
    ? "Ajoutez au moins un produit."
    : remaining > 0.0005 && !customer
      ? "Reste à payer : sélectionnez ou créez un client (le reste sera enregistré en crédit client)."
      : change > cashIn + 0.0005
        ? "Le trop-perçu ne peut être rendu qu'en espèces."
        : null;

  // Changement de client : les lignes déjà saisies sont recalculées à SES prix (pro, négociés).
  const customerId = customer?.id ?? null;
  const [repriced, setRepriced] = useState(0);
  useEffect(() => {
    const ids = lines.map((l) => l.productId);
    if (!ids.length) return;
    const ctrl = new AbortController();
    fetch(`/admin/api/produits?ids=${ids.join(",")}${customerId ? `&client=${customerId}` : ""}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items: ProductHit[] } | null) => {
        if (!data) return;
        const price = new Map(data.items.map((i) => [i.id, i.price]));
        setLines((ls) => ls.map((l) => (price.get(l.productId) != null ? { ...l, unitPrice: price.get(l.productId)! } : l)));
        setRepriced((n) => n + 1);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniquement quand le client change
  }, [customerId]);

  const add = (p: ProductHit) => {
    if (p.price == null) return alert(`« ${p.name} » n'a pas de prix de vente : vendez-le sur devis.`);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { productId: p.id, sku: p.sku, name: p.name, manufacturerRef: p.manufacturerRef ?? null, brand: p.brand ?? null, imageUrl: p.imageUrl ?? null, quantity: 1, unitPrice: p.price!, discountRate: 0, vatRate: p.vatRate, available: p.available }];
    });
  };
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const addPayment = (value?: number) => {
    const a = round3(value ?? (typed || Math.max(0, t.total - paid)));
    if (a <= 0) return;
    setPays((ps) => [...ps, { method, amount: a }]);
    setAmount("");
    setOnCredit(false);
  };

  const reset = () => {
    setLines([]);
    setPays([]);
    setGlobalDiscount(0);
    setAmount("");
    setOnCredit(false);
    setInvoice(false);
    setCustomer(null);
    setResult(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const validate = () => {
    if (blocker || pending) return;
    const payments = [...pays, ...(pending$ > 0 ? [{ method, amount: pending$ }] : [])];
    start(async () => {
      const res = await posSaleAction({
        sessionId,
        customerId: customer?.id ?? null,
        invoice,
        lines: effective.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, discountRate: l.discountRate })),
        payments,
      });
      setResult(res);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F9") { e.preventDefault(); validate(); }
      if (e.key === "Escape" && result?.ok) reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (result?.ok) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-line bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto size-14 text-accent" />
        <p className="mt-3 font-display text-2xl font-bold">Vente enregistrée</p>
        <p className="mt-1 font-mono text-sm text-steel">{result.number}</p>
        <dl className="mx-auto mt-5 max-w-xs space-y-1.5 text-left text-sm">
          <div className="flex justify-between"><dt className="text-steel">Total</dt><dd className="font-semibold tabular-nums">{formatTND(result.total)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel">Encaissé</dt><dd className="tabular-nums">{formatTND(result.paid)}</dd></div>
          {result.remaining > 0 && <div className="flex justify-between font-semibold text-amber-700"><dt>Reste à payer (crédit client)</dt><dd className="tabular-nums">{formatTND(result.remaining)}</dd></div>}
        </dl>
        {result.change > 0 && <p className="mt-4 rounded-lg bg-amber-50 py-3 text-xl font-bold text-amber-800">Monnaie à rendre : {formatTND(result.change)}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href={`/documents/ticket/${result.orderId}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white"><Printer className="size-4" /> Imprimer le ticket</a>
          {result.invoiceId && <a href={`/documents/facture/${result.invoiceId}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium"><ReceiptText className="size-4" /> Facture</a>}
          <Link href={`/admin/caisse/ventes/${result.orderId}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium">Détails de la vente</Link>
          <button type="button" onClick={reset} autoFocus className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white"><Plus className="size-4" /> Nouvelle vente (Échap)</button>
        </div>
        <Link href="/admin/caisse" className="mt-4 inline-flex items-center gap-1 text-sm text-steel hover:text-ink"><ArrowLeft className="size-4" /> Retour à la caisse</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-5 2xl:grid-cols-[1fr_420px] xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        {/* 1. Client */}
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4 text-accent" /> 1. Client</h2>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-64 flex-1"><CustomerPicker value={customer} onChange={(c) => { setCustomer(c); if (!c) setInvoice(false); }} /></div>
            {!customer && canCreateCustomer && !creating && (
              <button type="button" onClick={() => setCreating(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium hover:bg-mist"><UserPlus className="size-4" /> Nouveau client</button>
            )}
          </div>
          {creating && !customer && <QuickCustomer onCreated={(c) => { setCustomer(c); setCreating(false); }} onCancel={() => setCreating(false)} />}
          <p className="mt-2 text-xs text-steel">{customer ? `Le client est enregistré avec la vente${repriced > 0 && lines.length ? " ; les prix ont été recalculés selon ses tarifs" : ""}.` : "Sans client : vente comptoir, paiement intégral obligatoire."}</p>
        </section>

        {/* 2. Produits */}
        <section className="rounded-xl border border-line bg-white">
          <div className="border-b border-line p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package className="size-4 text-accent" /> 2. Produits vendus</h2>
            <ProductPicker onPick={add} customerId={customer?.id} autoFocus inputRef={searchRef} placeholder="Nom, référence SOGER, référence fabricant ou code-barres (F2)…" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-mist/60 text-xs text-steel uppercase">
                <tr><th className="w-14 p-3" /><th className="p-3 text-left">Produit</th><th className="p-3 text-left">Réf. SOGER</th><th className="p-3 text-left">Réf. fabricant</th><th className="p-3 text-left">Marque</th><th className="p-3 text-center">Qté</th><th className="p-3 text-right">PU HT</th><th className="w-20 p-3 text-right">Remise %</th><th className="p-3 text-right">Sous-total TTC</th><th /></tr>
              </thead>
              <tbody>
                {lines.length === 0 && <tr><td colSpan={10} className="p-10 text-center text-steel">Scannez un code-barres ou recherchez un produit du catalogue.</td></tr>}
                {lines.map((l, i) => (
                  <tr key={l.productId} className="border-t border-line align-middle">
                    <td className="p-2">
                      <div className="relative grid size-11 place-items-center overflow-hidden rounded-lg bg-mist">
                        {l.imageUrl ? <Image src={l.imageUrl} alt="" fill sizes="44px" className="object-contain p-1" unoptimized={!isOptimizable(l.imageUrl)} /> : <Package className="size-5 text-steel/50" />}
                      </div>
                    </td>
                    <td className="p-3"><p className="font-medium">{l.name}</p>{l.available < l.quantity && <p className="text-xs text-danger">Stock disponible : {l.available}</p>}</td>
                    <td className="p-3 font-mono text-xs">{l.sku}</td>
                    <td className="p-3 font-mono text-xs text-steel">{l.manufacturerRef ?? "—"}</td>
                    <td className="p-3 text-xs">{l.brand ?? "—"}</td>
                    <td className="p-3">
                      <div className="mx-auto flex h-9 w-28 items-center rounded-lg border border-line">
                        <button type="button" onClick={() => upd(i, { quantity: Math.max(1, l.quantity - 1) })} className="grid h-full w-8 place-items-center" aria-label="Diminuer"><Minus className="size-3.5" /></button>
                        <input value={l.quantity} onChange={(e) => upd(i, { quantity: Math.max(0.001, num(e.target.value) || 1) })} className="h-full w-12 border-x border-line text-center tabular-nums outline-none" aria-label={`Quantité ${l.sku}`} />
                        <button type="button" onClick={() => upd(i, { quantity: l.quantity + 1 })} className="grid h-full w-8 place-items-center" aria-label="Augmenter"><Plus className="size-3.5" /></button>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {canDiscount ? <input key={`${l.productId}-${repriced}`} defaultValue={l.unitPrice} onChange={(e) => upd(i, { unitPrice: num(e.target.value) })} className="h-9 w-24 rounded-md border border-line px-2 text-right" aria-label={`Prix ${l.sku}`} /> : formatTND(l.unitPrice)}
                    </td>
                    <td className="p-3 text-right">
                      {canDiscount ? <input defaultValue={l.discountRate || ""} onChange={(e) => upd(i, { discountRate: Math.min(100, num(e.target.value)) })} className="h-9 w-16 rounded-md border border-line px-2 text-right" aria-label={`Remise ${l.sku}`} /> : <span className="text-steel">{effective[i].discountRate || "—"}</span>}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">{formatTND(t.lines[i]?.total ?? 0)}</td>
                    <td className="p-3"><button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-steel hover:text-danger" aria-label={`Retirer ${l.sku}`}><Trash2 className="size-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="text-xs text-steel">Raccourcis : <kbd className="rounded border border-line px-1">F2</kbd> recherche · <kbd className="rounded border border-line px-1">Entrée</kbd> ajoute l&apos;article scanné · <kbd className="rounded border border-line px-1">F9</kbd> valider la vente</p>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        {/* 3. Calcul */}
        <div className="rounded-xl bg-ink p-5 text-white">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-white/50 uppercase">3. Total</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-white/70"><dt>Total brut HT</dt><dd className="tabular-nums">{formatTND(t.subtotal)}</dd></div>
            {canDiscount && (
              <div className="flex items-center justify-between text-white/70">
                <dt>Remise globale %</dt>
                <dd><input value={globalDiscount || ""} onChange={(e) => setGlobalDiscount(Math.min(100, num(e.target.value)))} className="h-8 w-16 rounded-md bg-white/10 px-2 text-right text-white" aria-label="Remise globale" /></dd>
              </div>
            )}
            <div className="flex justify-between text-white/70"><dt>Remise</dt><dd className="tabular-nums">{t.discountTotal ? `−${formatTND(t.discountTotal)}` : "—"}</dd></div>
            <div className="flex justify-between text-white/70"><dt>Total HT</dt><dd className="tabular-nums">{formatTND(t.netTotal)}</dd></div>
            {t.vatBreakdown.map((v) => <div key={v.rate} className="flex justify-between text-white/70"><dt>TVA {v.rate} %</dt><dd className="tabular-nums">{formatTND(v.vat)}</dd></div>)}
          </dl>
          <p className="mt-3 flex items-baseline justify-between border-t border-white/15 pt-3"><span className="text-sm">TOTAL TTC</span><span className="font-display text-3xl font-bold tabular-nums">{formatTND(t.total)}</span></p>
          {invoice && <p className="mt-1 text-right text-xs text-white/60">+ droit de timbre sur la facture</p>}
        </div>

        {/* 4. Paiement */}
        <div className="rounded-xl border border-line bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-steel uppercase">4. Paiement</h2>
          <div className="grid grid-cols-5 gap-1.5">
            {METHODS.map(([m, text, Icon]) => (
              <button key={m} type="button" onClick={() => { setMethod(m); setOnCredit(false); }} className={cn("flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium", !onCredit && method === m ? "border-accent bg-accent-soft/40 text-accent-hover" : "border-line text-graphite hover:bg-mist")}>
                <Icon className="size-5" /> {text}
              </button>
            ))}
            <button type="button" onClick={() => { setOnCredit(true); setAmount(""); }} className={cn("flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium", onCredit ? "border-amber-500 bg-amber-50 text-amber-800" : "border-line text-graphite hover:bg-mist")}>
              <HandCoins className="size-5" /> Crédit
            </button>
          </div>
          {!onCredit ? (
            <>
              <div className="mt-3 flex gap-2">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPayment())} placeholder={`Montant ${label(method).toLowerCase()} (${Math.max(0, t.total - paid).toFixed(3)})`} inputMode="decimal" className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-right tabular-nums" aria-label="Montant reçu" />
                <button type="button" onClick={() => addPayment()} className="h-11 rounded-lg border border-line px-3 text-sm font-medium hover:bg-mist" title="Ajouter ce paiement (paiement mixte)">+ Ajouter</button>
              </div>
              <p className="mt-1.5 text-xs text-steel">Montant inférieur au total = paiement partiel (reste en crédit client). « + Ajouter » pour combiner plusieurs modes.</p>
            </>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{paid > 0 ? "Le reste" : "Le total"} sera enregistré en <strong>crédit client</strong>{customer ? ` sur le compte de ${customer.name}` : " : sélectionnez un client"}. Aucune somme n&apos;entre en caisse.</p>
          )}
          {pays.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {pays.map((p, i) => (
                <li key={i} className="flex justify-between"><span>{label(p.method)}</span><span className="tabular-nums">{formatTND(p.amount)} <button type="button" onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))} className="ml-1 text-steel hover:text-danger" aria-label="Retirer ce paiement"><X className="inline size-3.5" /></button></span></li>
              ))}
            </ul>
          )}
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-steel">Montant payé</dt><dd className="font-semibold tabular-nums">{formatTND(Math.min(willPay, t.total))}</dd></div>
            <div className={cn("flex justify-between", remaining > 0 && "font-semibold text-amber-700")}><dt>Reste à payer{remaining > 0 ? " (crédit client)" : ""}</dt><dd className="tabular-nums">{formatTND(remaining)}</dd></div>
            {change > 0 && <div className="flex justify-between text-lg font-bold text-accent-hover"><dt>Monnaie à rendre</dt><dd className="tabular-nums">{formatTND(change)}</dd></div>}
          </dl>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} disabled={!customer} /> Émettre une facture {!customer && <span className="text-xs text-steel">(client requis)</span>}</label>
        </div>

        {/* 5. Validation */}
        {(blocker && lines.length > 0) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{blocker}</p>}
        {result && !result.ok && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{result.message}</p>}
        <button type="button" onClick={validate} disabled={!!blocker || pending} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
          {pending ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Valider la vente (F9)
        </button>
        {lines.length > 0 && <button type="button" onClick={reset} className="w-full text-center text-xs text-steel hover:text-danger">Annuler la vente en cours</button>}
      </aside>
    </div>
  );
}
