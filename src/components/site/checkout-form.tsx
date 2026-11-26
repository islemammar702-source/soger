"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Landmark, Store, Truck } from "lucide-react";
import { cart, cartTotals, useCart } from "@/lib/cart";
import { placeOrderAction, type FormState } from "@/server/account-actions";
import { cn, formatTND, withVat } from "@/lib/utils";
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
        <h2 className="mt-4 text-2xl font-bold">Merci, votre commande est enregistrée</h2>
        <p className="mt-2 text-steel">
          Commande <span className="font-mono font-semibold text-ink">{d.number}</span> — total <span className="font-semibold text-ink">{formatTND(d.total)}</span>
        </p>
        <div className="mt-6 rounded-lg bg-mist p-4 text-left text-sm text-graphite">
          {d.payment === "transfer" ? (
            <>
              <p className="font-semibold">Paiement par virement</p>
              <p className="mt-1">Indiquez la référence <span className="font-mono">{d.number}</span> dans le libellé du virement.</p>
              {bank ? <p className="mt-1 whitespace-pre-line">{bank}</p> : <p className="mt-1">Nos coordonnées bancaires vous sont communiquées par un conseiller.</p>}
            </>
          ) : d.payment === "cash_on_delivery" ? (
            <p>Vous réglerez à la livraison. Un conseiller vous appelle pour confirmer la date de livraison.</p>
          ) : (
            <p>Un conseiller vous appelle quand votre commande est prête. Le paiement se fait en magasin, au retrait.</p>
          )}
        </div>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {d.account ? (
            <Link href="/compte/commandes" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">Suivre ma commande</Link>
          ) : (
            <Link href="/compte/inscription" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">Créer un compte</Link>
          )}
          <Link href="/produits" className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium hover:bg-mist">Retour au catalogue</Link>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-line py-16 text-center">
        <p className="font-semibold">Votre panier est vide</p>
        <Link href="/produits" className="mt-4 inline-block text-sm font-medium text-accent">Voir le catalogue →</Link>
      </div>
    );
  }

  const fee = delivery === "delivery" && !(freeDeliveryFrom && totals.total >= freeDeliveryFrom) ? deliveryFee : 0;
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  const payments =
    delivery === "pickup"
      ? ([["cash", "Paiement en magasin", "Espèces, carte ou chèque au retrait", Store], ["transfer", "Virement bancaire", "Commande préparée à réception du virement", Landmark]] as const)
      : ([["cash_on_delivery", "Paiement à la livraison", "En espèces à la réception", Banknote], ["transfer", "Virement bancaire", "Expédition à réception du virement", Landmark]] as const);

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start" noValidate>
      <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({ productId: i.productId, quantity: i.quantity })))} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="space-y-6">
        {!defaults.loggedIn && (
          <p className="rounded-lg bg-mist px-4 py-3 text-sm text-graphite">
            Déjà client ? <Link href="/compte/connexion?suite=/commande" className="font-semibold text-accent">Connectez-vous</Link> pour retrouver vos informations et vos prix professionnels.
          </p>
        )}

        <Section title="1. Vos coordonnées">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom et prénom" error={err("name")}><Input name="name" defaultValue={defaults.name} autoComplete="name" invalid={!!err("name")} /></Field>
            <Field label="Téléphone" error={err("phone")}><Input name="phone" type="tel" defaultValue={defaults.phone} autoComplete="tel" invalid={!!err("phone")} /></Field>
            <Field label="E-mail" optional error={err("email")}><Input name="email" type="email" defaultValue={defaults.email} autoComplete="email" invalid={!!err("email")} /></Field>
            <Field label="Société" optional><Input name="company" defaultValue={defaults.company} autoComplete="organization" /></Field>
            <Field label="Matricule fiscal" optional hint="Pour une facture au nom de votre société"><Input name="taxId" defaultValue={defaults.taxId} /></Field>
          </div>
        </Section>

        <Section title="2. Mode de réception">
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice name="delivery" value="pickup" checked={delivery === "pickup"} onChange={() => { setDelivery("pickup"); setPayment("cash"); }} icon={<Store className="size-5" />} title="Retrait en magasin" text="Gratuit — nous vous prévenons quand c'est prêt" />
            <Choice name="delivery" value="delivery" checked={delivery === "delivery"} onChange={() => { setDelivery("delivery"); setPayment("cash_on_delivery"); }} icon={<Truck className="size-5" />} title="Livraison" text={`${formatTND(deliveryFee)} TTC${freeDeliveryFrom ? ` — offerte dès ${formatTND(freeDeliveryFrom)}` : ""}`} />
          </div>
          {delivery === "delivery" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Adresse" error={err("address")} className="sm:col-span-2"><Input name="address" defaultValue={defaults.address} autoComplete="street-address" invalid={!!err("address")} /></Field>
              <Field label="Ville" error={err("city")}><Input name="city" defaultValue={defaults.city} autoComplete="address-level2" invalid={!!err("city")} /></Field>
              <Field label="Gouvernorat" optional>
                <select name="governorate" defaultValue={defaults.governorate ?? ""} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent">
                  <option value="">—</option>
                  {GOVERNORATES.map((g) => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Code postal" optional><Input name="postalCode" defaultValue={defaults.postalCode} autoComplete="postal-code" inputMode="numeric" /></Field>
            </div>
          )}
        </Section>

        <Section title="3. Paiement">
          <div className="grid gap-3 sm:grid-cols-2">
            {payments.map(([value, title, text, Icon]) => (
              <Choice key={value} name="payment" value={value} checked={payment === value} onChange={() => setPayment(value)} icon={<Icon className="size-5" />} title={title} text={text} />
            ))}
          </div>
          {err("payment") && <p className="mt-2 text-xs text-danger">{err("payment")}</p>}
          <p className="mt-3 text-xs text-steel">Le paiement par carte en ligne sera proposé dès l&apos;activation d&apos;une passerelle de paiement.</p>
        </Section>

        <Section title="4. Remarques">
          <Textarea name="notes" rows={3} placeholder="Horaires de livraison, référence interne, précisions…" />
        </Section>
      </div>

      <aside className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft lg:sticky lg:top-28">
        <h2 className="font-display text-lg font-semibold">Votre commande</h2>
        <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="line-clamp-2 font-medium">{i.name}</span>
                <span className="text-xs text-steel">{i.quantity} × {i.unitPrice != null ? formatTND(withVat(i.unitPrice, i.vatRate)) : "sur devis"}</span>
              </span>
              <span className="shrink-0 font-medium">{i.unitPrice != null ? formatTND(withVat(i.unitPrice, i.vatRate) * i.quantity) : "—"}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-steel">Sous-total HT</dt><dd>{formatTND(totals.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel">TVA</dt><dd>{formatTND(totals.vatTotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel">Livraison</dt><dd>{fee ? formatTND(fee) : "Gratuite"}</dd></div>
          <div className="flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">Total TTC</dt><dd className="font-display text-2xl font-bold">{formatTND(totals.total + fee)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-steel">Les prix sont vérifiés par nos services lors de l&apos;enregistrement.</p>
        <div className="mt-5 space-y-3">
          <FormMessage state={state} />
          <SubmitButton pending={pending} className="h-12 w-full" pendingLabel="Enregistrement…">Valider la commande</SubmitButton>
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
