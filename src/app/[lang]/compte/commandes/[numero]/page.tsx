import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountShell } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { ORDER_STATUS, PAYMENT_STATUS, label } from "@/lib/labels";
import { getMyOrder } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.orderTitle, robots: { index: false } };
}

/** Paramètre fictif pour la validation au build (les vraies pages sont rendues à la demande). */
export function generateStaticParams() {
  return [{ numero: "_" }];
}

const STEPS = ["pending", "confirmed", "preparing", "shipped", "delivered"] as const;

async function OrderDetail({ params }: { params: PageProps<"/[lang]/compte/commandes/[numero]">["params"] }) {
  const { t, money, dateTime, status, deliveryMethod, href } = await getI18n();
  const a = t.account;
  const { numero } = await params;
  const { customer } = await requireCustomer(href(`/compte/commandes/${numero}`));
  const data = await getMyOrder(customer.id, decodeURIComponent(numero));
  if (!data) notFound();
  const { order: o, items, invoices } = data;
  const step = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-xl font-bold">{o.number}</h2>
        <Badge tone={label(ORDER_STATUS, o.status).tone}>{status("order", o.status)}</Badge>
        <Badge tone={label(PAYMENT_STATUS, o.paymentStatus).tone}>{status("payment", o.paymentStatus)}</Badge>
        <span className="text-sm text-steel">{dateTime(o.createdAt)}</span>
      </div>
      {step >= 0 && (
        <ol className="grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className={i <= step ? "font-semibold text-accent-hover" : "text-steel"}>
              <span className={`mb-2 block h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
              {status("order", s)}
            </li>
          ))}
        </ol>
      )}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-mist/70 text-xs tracking-wide text-steel uppercase">
            <tr><th className="px-4 py-3 text-start">{a.thItem}</th><th className="px-4 py-3 text-end">{a.thQty}</th><th className="px-4 py-3 text-end">{a.thUnit}</th><th className="px-4 py-3 text-end">{a.thLineTotal}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3"><p className="font-medium">{i.description}</p><p className="font-mono text-xs text-steel">{i.sku}</p></td>
                <td className="px-4 py-3 text-end">{Number(i.quantity)}</td>
                <td className="px-4 py-3 text-end">{money(i.unitPrice)}{Number(i.discountRate) > 0 && <span className="block text-xs text-steel">-{Number(i.discountRate)} %</span>}</td>
                <td className="px-4 py-3 text-end font-medium">{money(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 text-sm">
          <p className="font-semibold">{a.receptionPayment}</p>
          <p className="mt-2 text-steel">{deliveryMethod(o.deliveryMethod)}</p>
          {o.shippingAddress && <p className="text-steel">{[o.shippingAddress, o.shippingPostalCode, o.shippingCity, o.shippingGovernorate].filter(Boolean).join(", ")}</p>}
          <p className="mt-2 text-steel">{o.paymentMethod ? status("method", o.paymentMethod) : "—"}</p>
          {invoices.length > 0 && <p className="mt-3">{a.invoice} {invoices.map((f) => <Link key={f.id} href="/compte/factures" className="font-mono font-semibold text-accent">{f.number} </Link>)}</p>}
        </div>
        <dl className="space-y-2 rounded-[var(--radius-card)] border border-line bg-white p-5 text-sm">
          <div className="flex justify-between"><dt className="text-steel">{a.subtotalHT}</dt><dd>{money(o.subtotal)}</dd></div>
          {Number(o.discountTotal) > 0 && <div className="flex justify-between"><dt className="text-steel">{a.discounts}</dt><dd>-{money(o.discountTotal)}</dd></div>}
          {Number(o.shippingTotal) > 0 && <div className="flex justify-between"><dt className="text-steel">{a.shippingHT}</dt><dd>{money(o.shippingTotal)}</dd></div>}
          <div className="flex justify-between"><dt className="text-steel">{a.vat}</dt><dd>{money(o.vatTotal)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>{a.totalTTC}</dt><dd>{money(o.total)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel">{a.alreadyPaid}</dt><dd>{money(o.amountPaid)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export default async function OrderPage({ params }: PageProps<"/[lang]/compte/commandes/[numero]">) {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.orderTitle} current="/compte/commandes">
      <OrderDetail params={params} />
    </AccountShell>
  );
}
