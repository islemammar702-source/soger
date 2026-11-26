"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Banknote, CheckCircle2, CreditCard, FileText, Landmark, Loader2, Minus, Plus, Printer, ReceiptText, Trash2 } from "lucide-react";
import { posSaleAction, type SaleResult } from "@/server/admin/pos";
import { documentTotals, round3 } from "@/lib/totals";
import { cn, formatTND } from "@/lib/utils";
import { CustomerPicker, type CustomerRef } from "./doc-editors";
import { ProductPicker, type ProductHit } from "./line-editor";

type Line = { productId: number; sku: string; name: string; quantity: number; unitPrice: number; discountRate: number; vatRate: number; available: number };
type Pay = { method: "cash" | "card" | "transfer" | "check"; amount: number; reference?: string };
const METHODS = [["cash", "Espèces", Banknote], ["card", "Carte", CreditCard], ["transfer", "Virement", Landmark], ["check", "Chèque", FileText]] as const;

export function PosTerminal({ sessionId, canDiscount, initialCustomer }: { sessionId: number; canDiscount: boolean; initialCustomer: CustomerRef | null }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<CustomerRef | null>(initialCustomer);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [pays, setPays] = useState<Pay[]>([]);
  const [method, setMethod] = useState<Pay["method"]>("cash");
  const [tendered, setTendered] = useState("");
  const [invoice, setInvoice] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const effective = lines.map((l) => ({ ...l, discountRate: Math.min(100, Math.max(l.discountRate, globalDiscount)) }));
  const t = documentTotals(effective);
  const paid = round3(pays.reduce((s, p) => s + p.amount, 0));
  const remaining = round3(t.total - paid);
  const change = round3(Math.max(0, paid - t.total));

  const add = (p: ProductHit) => {
    if (p.price == null) return alert(`« ${p.name} » n'a pas de prix de vente : à vendre sur devis.`);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { productId: p.id, sku: p.sku, name: p.name, quantity: 1, unitPrice: p.price!, discountRate: 0, vatRate: p.vatRate, available: p.available }];
    });
  };

  const reset = () => {
    setLines([]);
    setPays([]);
    setGlobalDiscount(0);
    setTendered("");
    setInvoice(false);
    setCustomer(null);
    setResult(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const addPayment = () => {
    const amount = round3(Number(tendered.replace(",", ".")) || (remaining > 0 ? remaining : 0));
    if (amount <= 0) return;
    setPays((ps) => [...ps, { method, amount }]);
    setTendered("");
  };

  const checkout = () => {
    if (!lines.length || pending) return;
    // Sans paiement saisi : on encaisse le total avec le mode sélectionné.
    const payments = pays.length ? pays : remaining > 0 ? [{ method, amount: Number(tendered.replace(",", ".")) || t.total }] : [];
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
      if (e.key === "F9") { e.preventDefault(); checkout(); }
      if (e.key === "Escape" && result?.ok) reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (result?.ok) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-line bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto size-14 text-accent" />
        <p className="mt-3 font-display text-2xl font-bold">Vente enregistrée</p>
        <p className="mt-1 font-mono text-sm text-steel">{result.number}</p>
        <p className="mt-4 text-lg">Total <strong>{formatTND(result.total)}</strong></p>
        {result.change > 0 && <p className="mt-2 rounded-lg bg-amber-50 py-3 text-xl font-bold text-amber-800">Monnaie à rendre : {formatTND(result.change)}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href={`/documents/ticket/${result.orderId}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white"><Printer className="size-4" /> Imprimer le ticket</a>
          {result.invoiceId && <a href={`/documents/facture/${result.invoiceId}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium"><ReceiptText className="size-4" /> Facture</a>}
          <button type="button" onClick={reset} autoFocus className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white">Nouvelle vente (Échap)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        <ProductPicker onPick={add} customerId={customer?.id} autoFocus inputRef={searchRef} placeholder="Scanner un code-barres ou chercher (F2)…" />
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-mist/60 text-xs text-steel uppercase"><tr><th className="p-3 text-left">Article</th><th className="p-3 text-center">Qté</th><th className="p-3 text-right">PU HT</th>{canDiscount && <th className="w-20 p-3 text-right">Rem. %</th>}<th className="p-3 text-right">Total TTC</th><th /></tr></thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-steel">Scannez ou recherchez un article pour commencer.</td></tr>}
              {lines.map((l, i) => {
                const lt = t.lines[i];
                return (
                  <tr key={l.productId} className="border-t border-line">
                    <td className="p-3"><p className="font-medium">{l.name}</p><p className="font-mono text-xs text-steel">{l.sku}{l.available < l.quantity && <span className="ml-2 font-sans text-danger">stock {l.available}</span>}</p></td>
                    <td className="p-3">
                      <div className="mx-auto flex h-9 w-28 items-center rounded-lg border border-line">
                        <button type="button" onClick={() => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))} className="grid h-full w-8 place-items-center" aria-label="Moins"><Minus className="size-3.5" /></button>
                        <input value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: Math.max(0.001, Number(e.target.value.replace(",", ".")) || 1) } : x)))} className="h-full w-12 border-x border-line text-center tabular-nums outline-none" aria-label="Quantité" />
                        <button type="button" onClick={() => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x)))} className="grid h-full w-8 place-items-center" aria-label="Plus"><Plus className="size-3.5" /></button>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {canDiscount ? <input defaultValue={l.unitPrice} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value.replace(",", ".")) || 0 } : x)))} className="h-9 w-24 rounded-md border border-line px-2 text-right" aria-label="Prix" /> : formatTND(l.unitPrice)}
                    </td>
                    {canDiscount && <td className="p-3 text-right"><input defaultValue={l.discountRate || ""} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, discountRate: Math.min(100, Number(e.target.value.replace(",", ".")) || 0) } : x)))} className="h-9 w-16 rounded-md border border-line px-2 text-right" aria-label="Remise" /></td>}
                    <td className="p-3 text-right font-semibold tabular-nums">{formatTND(lt?.total ?? 0)}</td>
                    <td className="p-3"><button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-steel hover:text-danger" aria-label="Retirer"><Trash2 className="size-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-steel">Raccourcis : <kbd className="rounded border border-line px-1">F2</kbd> recherche · <kbd className="rounded border border-line px-1">Entrée</kbd> ajoute l&apos;article scanné · <kbd className="rounded border border-line px-1">F9</kbd> encaisser</p>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-steel uppercase">Client (facultatif)</p>
          <CustomerPicker value={customer} onChange={setCustomer} />
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} disabled={!customer} /> Émettre une facture {!customer && <span className="text-xs text-steel">(client requis)</span>}</label>
        </div>

        <div className="rounded-xl bg-ink p-5 text-white">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-white/70"><dt>Sous-total HT</dt><dd className="tabular-nums">{formatTND(t.subtotal)}</dd></div>
            {canDiscount && (
              <div className="flex items-center justify-between text-white/70">
                <dt>Remise globale %</dt>
                <dd><input value={globalDiscount || ""} onChange={(e) => setGlobalDiscount(Math.min(100, Number(e.target.value.replace(",", ".")) || 0))} className="h-8 w-16 rounded-md bg-white/10 px-2 text-right text-white" aria-label="Remise globale" /></dd>
              </div>
            )}
            {t.discountTotal > 0 && <div className="flex justify-between text-white/70"><dt>Remises</dt><dd className="tabular-nums">-{formatTND(t.discountTotal)}</dd></div>}
            <div className="flex justify-between text-white/70"><dt>TVA</dt><dd className="tabular-nums">{formatTND(t.vatTotal)}</dd></div>
          </dl>
          <p className="mt-3 flex items-baseline justify-between border-t border-white/15 pt-3"><span className="text-sm">TOTAL TTC</span><span className="font-display text-3xl font-bold tabular-nums">{formatTND(t.total)}</span></p>
          {invoice && <p className="mt-1 text-right text-xs text-white/60">+ droit de timbre sur facture</p>}
        </div>

        <div className="rounded-xl border border-line bg-white p-4">
          <div className="grid grid-cols-4 gap-2">
            {METHODS.map(([m, label, Icon]) => (
              <button key={m} type="button" onClick={() => setMethod(m)} className={cn("flex flex-col items-center gap-1 rounded-lg border py-2.5 text-xs font-medium", method === m ? "border-accent bg-accent-soft/40 text-accent-hover" : "border-line text-graphite hover:bg-mist")}>
                <Icon className="size-5" /> {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={tendered} onChange={(e) => setTendered(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPayment())} placeholder={remaining > 0 ? `Montant reçu (${remaining.toFixed(3)})` : "Montant"} inputMode="decimal" className="h-11 flex-1 rounded-lg border border-line px-3 text-right tabular-nums" aria-label="Montant reçu" />
            <button type="button" onClick={addPayment} className="h-11 rounded-lg border border-line px-3 text-sm font-medium hover:bg-mist">Ajouter</button>
          </div>
          {pays.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {pays.map((p, i) => (
                <li key={i} className="flex justify-between"><span>{METHODS.find((m) => m[0] === p.method)?.[1]}</span><span className="tabular-nums">{formatTND(p.amount)} <button type="button" onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))} className="ml-1 text-steel hover:text-danger" aria-label="Retirer">×</button></span></li>
              ))}
            </ul>
          )}
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-steel">Encaissé</dt><dd className="tabular-nums">{formatTND(paid)}</dd></div>
            {remaining > 0.0005 && pays.length > 0 && <div className="flex justify-between font-semibold text-amber-700"><dt>Reste à payer</dt><dd className="tabular-nums">{formatTND(remaining)}</dd></div>}
            {change > 0 && <div className="flex justify-between text-lg font-bold text-accent-hover"><dt>Monnaie à rendre</dt><dd className="tabular-nums">{formatTND(change)}</dd></div>}
          </dl>
          {result && !result.ok && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{result.message}</p>}
          <button type="button" onClick={checkout} disabled={!lines.length || pending} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
            {pending ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Encaisser (F9)
          </button>
          {lines.length > 0 && <button type="button" onClick={reset} className="mt-2 w-full text-center text-xs text-steel hover:text-danger">Annuler la vente</button>}
        </div>
      </aside>
    </div>
  );
}
