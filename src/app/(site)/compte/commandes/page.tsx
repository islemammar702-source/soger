import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS, PAYMENT_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { getMyOrders } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Mes commandes", robots: { index: false } };

async function Orders() {
  const { customer } = await requireCustomer("/compte/commandes");
  const orders = await getMyOrders(customer.id);
  if (!orders.length) return <EmptyState title="Aucune commande" text="Vos commandes en ligne et en boutique apparaîtront ici." href="/produits" cta="Voir le catalogue" />;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-mist/70 text-left text-xs tracking-wide text-steel uppercase">
          <tr><th className="px-4 py-3">Commande</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Paiement</th><th className="px-4 py-3 text-right">Total TTC</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-mist/50">
              <td className="px-4 py-3"><Link href={`/compte/commandes/${o.number}`} className="font-mono font-semibold text-accent">{o.number}</Link></td>
              <td className="px-4 py-3 text-steel">{formatDate(o.createdAt)}</td>
              <td className="px-4 py-3"><Badge tone={label(ORDER_STATUS, o.status).tone}>{label(ORDER_STATUS, o.status).label}</Badge></td>
              <td className="px-4 py-3"><Badge tone={label(PAYMENT_STATUS, o.paymentStatus).tone}>{label(PAYMENT_STATUS, o.paymentStatus).label}</Badge></td>
              <td className="px-4 py-3 text-right font-semibold">{formatTND(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <AccountShell title="Mes commandes" current="/compte/commandes">
      <Orders />
    </AccountShell>
  );
}
