import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { ORDER_STATUS, PAYMENT_STATUS, label } from "@/lib/labels";
import { getMyOrders } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.ordersTitle, robots: { index: false } };
}

async function Orders() {
  const { t, money, date, status, href } = await getI18n();
  const a = t.account;
  const { customer } = await requireCustomer(href("/compte/commandes"));
  const orders = await getMyOrders(customer.id);
  if (!orders.length) return <EmptyState title={a.noOrders} text={a.noOrdersText} href="/produits" cta={a.seeCatalog} />;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-mist/70 text-start text-xs tracking-wide text-steel uppercase">
          <tr><th className="px-4 py-3 text-start">{a.thOrder}</th><th className="px-4 py-3 text-start">{a.thDate}</th><th className="px-4 py-3 text-start">{a.thStatus}</th><th className="px-4 py-3 text-start">{a.thPayment}</th><th className="px-4 py-3 text-end">{a.thTotal}</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-mist/50">
              <td className="px-4 py-3"><Link href={`/compte/commandes/${o.number}`} className="font-mono font-semibold text-accent">{o.number}</Link></td>
              <td className="px-4 py-3 text-steel">{date(o.createdAt)}</td>
              <td className="px-4 py-3"><Badge tone={label(ORDER_STATUS, o.status).tone}>{status("order", o.status)}</Badge></td>
              <td className="px-4 py-3"><Badge tone={label(PAYMENT_STATUS, o.paymentStatus).tone}>{status("payment", o.paymentStatus)}</Badge></td>
              <td className="px-4 py-3 text-end font-semibold">{money(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function OrdersPage() {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.ordersTitle} current="/compte/commandes">
      <Orders />
    </AccountShell>
  );
}
