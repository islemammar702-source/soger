import type { Metadata } from "next";
import { BadgeCheck, Clock, Package, Receipt } from "lucide-react";
import { AccountShell } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { ORDER_STATUS, label } from "@/lib/labels";
import { getMyBalance, getMyOrders, getMyQuotes } from "@/server/account-data";
import { isApprovedPro, requireCustomer } from "@/server/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.area, robots: { index: false } };
}

async function Overview() {
  const { t, fmt, money, date, status, href } = await getI18n();
  const a = t.account;
  const { user, customer } = await requireCustomer(href("/compte"));
  const [orders, quotes, balance] = await Promise.all([getMyOrders(customer.id), getMyQuotes(customer.id), getMyBalance(customer.id)]);
  const pro = isApprovedPro(customer);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-steel">{a.hello}</p>
          <p className="font-display text-2xl font-bold">{user.name}</p>
          <p className="mt-1 font-mono text-xs text-steel">{fmt(a.client, { code: customer.code })}</p>
        </div>
        {customer.type === "professional" &&
          (pro ? (
            <Badge tone="bg-accent-soft text-accent-hover"><BadgeCheck className="me-1 size-3.5" /> {a.proValidated}</Badge>
          ) : (
            <Badge tone="bg-amber-50 text-amber-700"><Clock className="me-1 size-3.5" /> {a.proPending}</Badge>
          ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Package className="size-5" />} label={a.statOrders} value={String(orders.length)} href="/compte/commandes" />
        <Stat icon={<Receipt className="size-5" />} label={a.statQuotes} value={String(quotes.length)} href="/compte/devis" />
        <Stat icon={<Receipt className="size-5" />} label={a.statBalance} value={money(balance)} href="/compte/factures" />
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{a.latestOrders}</h2>
          <Link href="/compte/commandes" className="text-sm font-medium text-accent">{t.common.seeAll}</Link>
        </div>
        {orders.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/compte/commandes/${o.number}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-mist/60">
                  <span className="font-mono text-sm font-semibold">{o.number}</span>
                  <span className="text-sm text-steel">{date(o.createdAt)}</span>
                  <Badge tone={label(ORDER_STATUS, o.status).tone}>{status("order", o.status)}</Badge>
                  <span className="font-semibold">{money(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-steel">
            {a.noOrdersYet} <Link href="/produits" className="font-semibold text-accent">{a.browse}</Link>
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft transition hover:shadow-lift">
      <span className="grid size-10 place-items-center rounded-lg bg-mist text-accent">{icon}</span>
      <p className="mt-4 text-sm text-steel">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
    </Link>
  );
}

export default async function AccountPage() {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.area} current="/compte">
      <Overview />
    </AccountShell>
  );
}
