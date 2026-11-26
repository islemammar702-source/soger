import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountShell } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, formatDateTime, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { getMyOrder } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Détail de commande", robots: { index: false } };

/** Paramètre fictif pour la validation au build (les vraies pages sont rendues à la demande). */
export function generateStaticParams() {
  return [{ numero: "_" }];
}

const STEPS = ["pending", "confirmed", "preparing", "shipped", "delivered"] as const;

async function OrderDetail({ params }: { params: PageProps<"/compte/commandes/[numero]">["params"] }) {
  const { numero } = await params;
  const { customer } = await requireCustomer(`/compte/commandes/${numero}`);
  const data = await getMyOrder(customer.id, decodeURIComponent(numero));
  if (!data) notFound();
  const { order: o, items, invoices } = data;
  const step = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-xl font-bold">{o.number}</h2>
        <Badge tone={label(ORDER_STATUS, o.status).tone}>{label(ORDER_STATUS, o.status).label}</Badge>
        <Badge tone={label(PAYMENT_STATUS, o.paymentStatus).tone}>{label(PAYMENT_STATUS, o.paymentStatus).label}</Badge>
        <span className="text-sm text-steel">{formatDateTime(o.createdAt)}</span>
      </div>
      {step >= 0 && (
        <ol className="grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className={i <= step ? "font-semibold text-accent-hover" : "text-steel"}>
              <span className={`mb-2 block h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
              {label(ORDER_STATUS, s).label}
            </li>
          ))}
        </ol>
      )}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-mist/70 text-left text-xs tracking-wide text-steel uppercase">
            <tr><th className="px-4 py-3">Article</th><th className="px-4 py-3 text-right">Qté</th><th className="px-4 py-3 text-right">PU HT</th><th className="px-4 py-3 text-right">Total HT</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3"><p className="font-medium">{i.description}</p><p className="font-mono text-xs text-steel">{i.sku}</p></td>
                <td className="px-4 py-3 text-right">{Number(i.quantity)}</td>
                <td className="px-4 py-3 text-right">{formatTND(i.unitPrice)}{Number(i.discountRate) > 0 && <span className="block text-xs text-steel">-{Number(i.discountRate)} %</span>}</td>
                <td className="px-4 py-3 text-right font-medium">{formatTND(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 text-sm">
          <p className="font-semibold">Réception et paiement</p>
          <p className="mt-2 text-steel">{o.deliveryMethod ?? "—"}</p>
          {o.shippingAddress && <p className="text-steel">{[o.shippingAddress, o.shippingPostalCode, o.shippingCity, o.shippingGovernorate].filter(Boolean).join(", ")}</p>}
          <p className="mt-2 text-steel">{o.paymentMethod ? PAYMENT_METHOD[o.paymentMethod] : "—"}</p>
          {invoices.length > 0 && <p className="mt-3">Facture : {invoices.map((f) => <Link key={f.id} href="/compte/factures" className="font-mono font-semibold text-accent">{f.number} </Link>)}</p>}
        </div>
        <dl className="space-y-2 rounded-[var(--radius-card)] border border-line bg-white p-5 text-sm">
          <div className="flex justify-between"><dt className="text-steel">Sous-total HT</dt><dd>{formatTND(o.subtotal)}</dd></div>
          {Number(o.discountTotal) > 0 && <div className="flex justify-between"><dt className="text-steel">Remises</dt><dd>-{formatTND(o.discountTotal)}</dd></div>}
          {Number(o.shippingTotal) > 0 && <div className="flex justify-between"><dt className="text-steel">Livraison HT</dt><dd>{formatTND(o.shippingTotal)}</dd></div>}
          <div className="flex justify-between"><dt className="text-steel">TVA</dt><dd>{formatTND(o.vatTotal)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total TTC</dt><dd>{formatTND(o.total)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel">Déjà payé</dt><dd>{formatTND(o.amountPaid)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export default function OrderPage({ params }: PageProps<"/compte/commandes/[numero]">) {
  return (
    <AccountShell title="Détail de commande" current="/compte/commandes">
      <OrderDetail params={params} />
    </AccountShell>
  );
}
