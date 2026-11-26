"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useFormAction } from "@/components/ui/form";
import { AlertCircle, ArrowRight, CheckCircle2, FileText, Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { cart, cartTotals, useCart, type CartItem } from "@/lib/cart";
import { submitCartQuote, type CartQuoteState } from "@/server/cart-quote";
import { cn, withVat } from "@/lib/utils";
import { Link, useI18n } from "@/i18n/client";
import { isOptimizable } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

type Fresh = Omit<CartItem, "quantity"> & { available: number };

function withoutStock(p: Fresh): Omit<CartItem, "quantity"> {
  const copy: Partial<Fresh> = { ...p };
  delete copy.available;
  return copy as Omit<CartItem, "quantity">;
}

export function CartView() {
  const { t, fmt, money } = useI18n();
  const items = useCart();
  const [hydrated, setHydrated] = useState(false);
  const [stockById, setStockById] = useState<Map<number, number>>(new Map());
  const [changed, setChanged] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [sentNumber, setSentNumber] = useState<string | null>(null);

  // Revalide les prix et la disponibilité auprès du serveur à l'ouverture du panier.
  const idsKey = items.map((i) => i.productId).sort((a, b) => a - b).join(",");
  useEffect(() => {
    const ids = idsKey ? idsKey.split(",").map(Number) : [];
    if (!ids.length) return;
    const ctrl = new AbortController();
    fetch("/api/panier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { products: Fresh[] } | null) => {
        if (!data) return;
        const fresh = new Map(data.products.map((p) => [p.productId, withoutStock(p)]));
        setStockById(new Map(data.products.map((p) => [p.productId, p.available])));
        const current = new Map(items.map((i) => [i.productId, i]));
        const differs = ids.some((id) => !fresh.has(id) || fresh.get(id)!.unitPrice !== current.get(id)?.unitPrice);
        if (differs) {
          setChanged(true);
          cart.sync(fresh);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revalide seulement quand la liste de produits change
  }, [idsKey]);

  const totals = cartTotals(items);

  if (sentNumber) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-white py-16 text-center shadow-soft">
        <CheckCircle2 className="size-12 text-accent" />
        <p className="mt-4 text-xl font-bold">{t.cart.quoteSent}</p>
        <p className="mt-2 max-w-md text-sm text-steel">{fmt(t.cart.quoteSentText, { number: sentNumber })}</p>
        <Link href="/produits" className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
          {t.cart.backCatalog}
        </Link>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line py-20 text-center">
        <ShoppingCart className="size-10 text-steel/60" />
        <p className="mt-4 font-semibold">{t.cart.empty}</p>
        <p className="mt-1 max-w-sm text-sm text-steel">{t.cart.emptyText}</p>
        <Link href="/produits" className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
          {t.cart.seeCatalog}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start">
      <div>
        {changed && (
          <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="size-4 shrink-0" /> {t.cart.updated}
          </p>
        )}
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
          {items.map((i) => (
            <CartLine key={i.productId} item={i} available={stockById.get(i.productId)} />
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/produits" className="font-medium text-graphite hover:text-accent"><span className="inline-block rtl:rotate-180">←</span> {t.cart.continue}</Link>
          <button type="button" onClick={() => cart.clear()} className="text-steel hover:text-danger">{t.cart.clear}</button>
        </div>
      </div>

      <aside className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft lg:sticky lg:top-28">
        <h2 className="font-display text-lg font-semibold">{t.cart.summary}</h2>
        <dl className={cn("mt-4 space-y-2 text-sm transition-opacity", !hydrated && "opacity-60")}>
          <div className="flex justify-between"><dt className="text-steel">{t.cart.subtotalHT}</dt><dd className="font-medium">{money(totals.subtotal)}</dd></div>
          {totals.vat.map((v) => (
            <div key={v.rate} className="flex justify-between">
              <dt className="text-steel">{fmt(t.cart.vatRate, { rate: Number(v.rate) })}</dt>
              <dd className="font-medium">{money(v.vat)}</dd>
            </div>
          ))}
          <div className="flex justify-between"><dt className="text-steel">{t.cart.delivery}</dt><dd className="text-steel">{t.cart.deliveryLater}</dd></div>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <dt className="font-semibold">{t.cart.totalTTC}</dt>
            <dd className="font-display text-2xl font-bold">{money(totals.total)}</dd>
          </div>
        </dl>
        {totals.hasPriceOnRequest && <p className="mt-2 text-xs text-steel">{t.cart.onRequestNote}</p>}

        <div className="mt-5 space-y-2.5">
          <Link
            href="/commande"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent font-medium text-white shadow-[0_8px_20px_-8px_rgb(22_163_74/0.6)] transition hover:bg-accent-hover"
          >
            {t.cart.order} <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>
          <p className="text-center text-xs text-steel">{t.cart.orderNote}</p>
          <button
            type="button"
            onClick={() => setQuoteOpen((v) => !v)}
            aria-expanded={quoteOpen}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-line font-medium text-ink transition hover:bg-mist"
          >
            <FileText className="size-4 text-accent" /> {t.cart.quoteCart}
          </button>
        </div>
        {quoteOpen && <CartQuoteForm items={items} onSent={setSentNumber} />}
      </aside>
    </div>
  );
}

function CartLine({ item, available }: { item: CartItem; available?: number }) {
  const { t, fmt, plural, money, unit } = useI18n();
  const unitTTC = item.unitPrice != null ? withVat(item.unitPrice, item.vatRate) : null;
  const short = available !== undefined && available < item.quantity;
  return (
    <li className="flex gap-4 p-4">
      <Link href={`/produits/${item.slug}`} className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-mist sm:size-24">
        {item.imageUrl ? (
          <Image unoptimized={!isOptimizable(item.imageUrl)} src={item.imageUrl} alt="" fill sizes="96px" className="object-contain p-2" />
        ) : (
          <CategoryIcon name={item.icon} className="size-9 text-steel/40" />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-steel uppercase">{item.brandName}</p>
          <Link href={`/produits/${item.slug}`} className="line-clamp-2 font-semibold hover:text-accent">{item.name}</Link>
          <p className="font-mono text-xs text-steel">{fmt(t.common.ref, { sku: item.sku })}</p>
          <p className="mt-1 text-sm text-steel">{unitTTC != null ? fmt(t.cart.unitPrice, { price: money(unitTTC), unit: unit(item.unit) }) : t.common.priceOnRequest}</p>
          {short && (
            <p className="mt-1 text-xs text-amber-700">
              {available! > 0 ? plural(t.cart.partialStock, available!) : t.common.onOrder}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <QuantityStepper value={item.quantity} onChange={(n) => cart.setQuantity(item.productId, n)} />
          <p className="w-28 text-end font-semibold">{unitTTC != null ? money(unitTTC * item.quantity) : "—"}</p>
          <button type="button" onClick={() => cart.remove(item.productId)} aria-label={fmt(t.cart.remove, { name: item.name })} className="grid size-9 place-items-center rounded-lg text-steel hover:bg-mist hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function QuantityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(String(value));
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setDraft(String(value));
  }
  return (
    <div className="flex h-10 items-center rounded-lg border border-line bg-white">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={t.cart.decrease} className="grid h-full w-9 place-items-center text-graphite disabled:opacity-40">
        <Minus className="size-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={draft}
        aria-label={t.cart.quantity}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(Number(draft))}
        onKeyDown={(e) => e.key === "Enter" && onChange(Number(draft))}
        className="h-full w-12 [appearance:textfield] border-x border-line text-center text-sm font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(value + 1)} aria-label={t.cart.increase} className="grid h-full w-9 place-items-center text-graphite">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

const field =
  "h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10 aria-[invalid=true]:border-danger";

function CartQuoteForm({ items, onSent }: { items: CartItem[]; onSent: (n: string) => void }) {
  const { t, message } = useI18n();
  const [state, onSubmit, pending] = useFormAction<CartQuoteState>(async (prev: CartQuoteState, form: FormData) => {
    const result = await submitCartQuote(prev, form);
    if (result.status === "success") {
      onSent(result.number);
      cart.clear();
    }
    return result;
  }, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? message(state.fieldErrors?.[k]?.[0]) || undefined : undefined);
  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3 border-t border-line pt-5" noValidate>
      <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({ productId: i.productId, quantity: i.quantity })))} />
      <input name="name" placeholder={t.cart.namePh} autoComplete="name" className={field} aria-invalid={!!err("name")} aria-label={t.cart.namePh} />
      {err("name") && <p className="text-xs text-danger">{err("name")}</p>}
      <input name="company" placeholder={t.cart.companyPh} autoComplete="organization" className={field} aria-label={t.cart.companyPh} />
      <input name="phone" type="tel" placeholder={t.cart.phonePh} autoComplete="tel" className={field} aria-invalid={!!err("phone")} aria-label={t.cart.phonePh} />
      {err("phone") && <p className="text-xs text-danger">{err("phone")}</p>}
      <input name="email" type="email" placeholder={t.cart.emailPh} autoComplete="email" className={field} aria-invalid={!!err("email")} aria-label={t.cart.emailPh} />
      {err("email") && <p className="text-xs text-danger">{err("email")}</p>}
      <textarea name="message" rows={3} placeholder={t.cart.detailsPh} className={cn(field, "h-auto py-3")} aria-label={t.cart.details} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state.status === "error" && <p role="alert" className="text-sm text-danger">{message(state.message)}</p>}
      <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink font-medium text-white hover:bg-graphite disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />} {t.cart.send}
      </button>
    </form>
  );
}
