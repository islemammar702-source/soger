import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Clock, Package, Receipt } from "lucide-react";
import { AccountShell } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { getMyBalance, getMyOrders, getMyQuotes } from "@/server/account-data";
import { isApprovedPro, requireCustomer } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Espace client", robots: { index: false } };

async function Overview() {
  const { user, customer } = await requireCustomer("/compte");
  const [orders, quotes, balance] = await Promise.all([getMyOrders(customer.id), getMyQuotes(customer.id), getMyBalance(customer.id)]);
  const pro = isApprovedPro(customer);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-steel">Bonjour,</p>
          <p className="font-display text-2xl font-bold">{user.name}</p>
          <p className="mt-1 font-mono text-xs text-steel">Client {customer.code}</p>
        </div>
        {customer.type === "professional" &&
          (pro ? (
            <Badge tone="bg-accent-soft text-accent-hover"><BadgeCheck className="mr-1 size-3.5" /> Compte professionnel validé</Badge>
          ) : (
            <Badge tone="bg-amber-50 text-amber-700"><Clock className="mr-1 size-3.5" /> Compte pro en cours de vérification</Badge>
          ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Package className="size-5" />} label="Commandes" value={String(orders.length)} href="/compte/commandes" />
        <Stat icon={<Receipt className="size-5" />} label="Devis reçus" value={String(quotes.length)} href="/compte/devis" />
        <Stat icon={<Receipt className="size-5" />} label="Reste à payer" value={formatTND(balance)} href="/compte/factures" />
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Dernières commandes</h2>
          <Link href="/compte/commandes" className="text-sm font-medium text-accent">Tout voir</Link>
        </div>
        {orders.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/compte/commandes/${o.number}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-mist/60">
                  <span className="font-mono text-sm font-semibold">{o.number}</span>
                  <span className="text-sm text-steel">{formatDate(o.createdAt)}</span>
                  <Badge tone={label(ORDER_STATUS, o.status).tone}>{label(ORDER_STATUS, o.status).label}</Badge>
                  <span className="font-semibold">{formatTND(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-steel">
            Aucune commande pour l&apos;instant. <Link href="/produits" className="font-semibold text-accent">Parcourir le catalogue</Link>
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

export default function AccountPage() {
  return (
    <AccountShell title="Espace client" current="/compte">
      <Overview />
    </AccountShell>
  );
}
