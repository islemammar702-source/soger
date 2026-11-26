"use client";

import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Landmark, Store, Truck } from "lucide-react";
import { cart, cartTotals, useCart } from "@/lib/cart";
import { placeOrderAction, type FormState } from "@/server/account-actions";
import { cn, withVat } from "@/lib/utils";
import { Link, useI18n } from "@/i18n/client";
import { Field, FormMessage, Input, SubmitButton, Textarea, useFormAction } from "@/components/ui/form";

export type CheckoutDefaults = {
  name?: string;
  company?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  governorate?: string;
  postalCode?: string;
  loggedIn: boolean;
};

const GOVERNORATES = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan", "Kasserine", "Kébili", "Le Kef", "Mahdia",
  "La Manouba", "Médenine", "Monastir", "Nabeul", "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
];

export function CheckoutForm({ defaults, deliveryFee, freeDeliveryFrom, bank }: { defaults: CheckoutDefaults; deliveryFee: number; freeDeliveryFrom: number | null; bank: string }) {
  const { t, fmt, money, locale } = useI18n();
  const items = useCart();
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [payment, setPayment] = useState<"cash" | "cash_on_delivery" | "transfer">("cash");
  const [state, onSubmit, pending] = useFormAction<FormState>(placeOrderAction, { status: "idle" });
  const totals = cartTotals(items);

  useEffect(() => {
    if (state.status === "success") cart.clear();
  }, [state.status]);

  if (state.status === "success" && state.data) {
    const d = state.data;
    return (
      <div className="mx-auto max-w-2xl rounded-[var(--radius-card)] border border-line bg-white p-8 text-center shadow-soft">
        <CheckCircle2 className="mx-auto size-14 text-accent" />
        <h2 className="mt-4 text-2xl font-bold">{t.checkout.thanks}</h2>
        <p className="mt-2 text-steel">{fmt(t.checkout.summaryLine, { number: d.number, total: money(d.total) })}</p>
        <div className="mt-6 rounded-lg bg-mist p-4 text-start text-sm text-graphite">
          {d.payment === "transfer" ? (
            <>
              <p className="font-semibold">{t.checkout.transferTitle}</p>
              <p className="mt-1">{fmt(t.checkout.transferRef, { number: d.number })}</p>
              {bank ? <p className="mt-1 whitespace-pre-line" dir="ltr">{bank}</p> : <p className="mt-1">{t.checkout.bankLater}</p>}
            </>
          ) : d.payment === "cash_on_delivery" ? (
            <p>{t.checkout.codNote}</p>
          ) : (
            <p>{t.checkout.pickupNote}</p>
          )}
        </div>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {d.account ? (
            <Link href="/compte/commandes" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">{t.checkout.track}</Link>
          ) : (
            <Link href="/compte/inscription" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">{t.checkout.createAccount}</Link>
          )}
          <Link href="/produits" className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium hover:bg-mist">{t.checkout.backCatalog}</Link>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-line py-16 text-center">
        <p className="font-semibold">{t.checkout.empty}</p>
        <Link href="/produits" className="mt-4 inline-block text-sm font-medium text-accent">{t.checkout.seeCatalog} <span className="inline-block rtl:rotate-180">→</span></Link>
      </div>
    );
  }

  const fee = delivery === "delivery" && !(freeDeliveryFrom && totals.total >= freeDeliveryFrom) ? deliveryFee : 0;
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  const c = t.checkout;
  const payments =
    delivery === "pickup"
      ? ([["cash", c.payStore, c.payStoreText, Store], ["transfer", c.payTransfer, c.payTransferPickup, Landmark]] as const)
      : ([["cash_on_delivery", c.payCod, c.payCodText, Banknote], ["transfer", c.payTransfer, c.payTransferDelivery, Landmark]] as const);

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start" noValidate>
      <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({ productId: i.productId, quantity: i.quantity })))} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="space-y-6">
        {!defaults.loggedIn && (
          <p className="rounded-lg bg-mist px-4 py-3 text-sm text-graphite">
            {c.alreadyCustomer} <Link href={`/compte/connexion?suite=${encodeURIComponent(`/${locale}/commande`)}`} className="font-semibold text-accent">{c.login}</Link> {c.loginNote}
          </p>
        )}

        <Section title={c.s1}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={c.name} error={err("name")}><Input name="name" defaultValue={defaults.name} autoComplete="name" invalid={!!err("name")} /></Field>
            <Field label={c.phone} error={err("phone")}><Input name="phone" type="tel" dir="ltr" defaultValue={defaults.phone} autoComplete="tel" invalid={!!err("phone")} className="rtl:text-right" /></Field>
            <Field label={c.email} optional error={err("email")}><Input name="email" type="email" defaultValue={defaults.email} autoComplete="email" invalid={!!err("email")} /></Field>
            <Field label={c.company} optional><Input name="company" defaultValue={defaults.company} autoComplete="organization" /></Field>
            <Field label={c.taxId} optional hint={c.taxIdHint}><Input name="taxId" defaultValue={defaults.taxId} /></Field>
          </div>
        </Section>

        <Section title={c.s2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice name="delivery" value="pickup" checked={delivery === "pickup"} onChange={() => { setDelivery("pickup"); setPayment("cash"); }} icon={<Store className="size-5" />} title={c.pickup} text={c.pickupText} />
            <Choice name="delivery" value="delivery" checked={delivery === "delivery"} onChange={() => { setDelivery("delivery"); setPayment("cash_on_delivery"); }} icon={<Truck className="size-5" />} title={c.delivery} text={`${fmt(c.deliveryFee, { fee: money(deliveryFee) })}${freeDeliveryFrom ? fmt(c.freeFrom, { amount: money(freeDeliveryFrom) }) : ""}`} />
          </div>
          {delivery === "delivery" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={c.address} error={err("address")} className="sm:col-span-2"><Input name="address" defaultValue={defaults.address} autoComplete="street-address" invalid={!!err("address")} /></Field>
              <Field label={c.city} error={err("city")}><Input name="city" defaultValue={defaults.city} autoComplete="address-level2" invalid={!!err("city")} /></Field>
              <Field label={c.governorate} optional>
                <select name="governorate" defaultValue={defaults.governorate ?? ""} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent">
                  <option value="">—</option>
                  {GOVERNORATES.map((g) => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label={c.postalCode} optional><Input name="postalCode" defaultValue={defaults.postalCode} autoComplete="postal-code" inputMode="numeric" /></Field>
            </div>
          )}
        </Section>

        <Section title={c.s3}>
          <div className="grid gap-3 sm:grid-cols-2">
            {payments.map(([value, title, text, Icon]) => (
              <Choice key={value} name="payment" value={value} checked={payment === value} onChange={() => setPayment(value)} icon={<Icon className="size-5" />} title={title} text={text} />
            ))}
          </div>
          {err("payment") && <p className="mt-2 text-xs text-danger">{err("payment")}</p>}
          <p className="mt-3 text-xs text-steel">{c.cardSoon}</p>
        </Section>

        <Section title={c.s4}>
          <Textarea name="notes" rows={3} placeholder={c.notesPh} />
        </Section>
      </div>

      <aside className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft lg:sticky lg:top-28">
        <h2 className="font-display text-lg font-semibold">{c.yourOrder}</h2>
        <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pe-1">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="line-clamp-2 font-medium">{i.name}</span>
                <span className="text-xs text-steel">{i.quantity} × {i.unitPrice != null ? money(withVat(i.unitPrice, i.vatRate)) : t.common.onQuote}</span>
              </span>
              <span className="shrink-0 font-medium">{i.unitPrice != null ? money(withVat(i.unitPrice, i.vatRate) * i.quantity) : "—"}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-steel">{t.cart.subtotalHT}</dt><dd>{money(totals.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel">{c.vat}</dt><dd>{money(totals.vatTotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel">{c.delivery}</dt><dd>{fee ? money(fee) : c.free}</dd></div>
          <div className="flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">{t.cart.totalTTC}</dt><dd className="font-display text-2xl font-bold">{money(totals.total + fee)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-steel">{c.pricesChecked}</p>
        <div className="mt-5 space-y-3">
          <FormMessage state={state} />
          <SubmitButton pending={pending} className="h-12 w-full" pendingLabel={c.submitting}>{c.submit}</SubmitButton>
        </div>
      </aside>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Choice({ name, value, checked, onChange, icon, title, text }: { name: string; value: string; checked: boolean; onChange: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 transition", checked ? "border-accent bg-accent-soft/40 ring-2 ring-accent/20" : "border-line hover:border-ink/30")}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", checked ? "bg-accent text-white" : "bg-mist text-graphite")}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-steel">{text}</span>
      </span>
    </label>
  );
}
