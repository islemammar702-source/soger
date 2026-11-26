import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { getMyQuotes } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Mes devis", robots: { index: false } };

async function Quotes() {
  const { customer } = await requireCustomer("/compte/devis");
  const quotes = await getMyQuotes(customer.id);
  if (!quotes.length) return <EmptyState title="Aucun devis" text="Les devis que nous vous envoyons apparaîtront ici." href="/devis" cta="Demander un devis" />;
  return (
    <ul className="space-y-3">
      {quotes.map((q) => (
        <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
          <div>
            <p className="font-mono font-semibold">{q.number}</p>
            <p className="text-xs text-steel">{formatDate(q.createdAt)} · {q.lines} ligne{q.lines > 1 ? "s" : ""}{q.validUntil ? ` · valable jusqu'au ${formatDate(q.validUntil)}` : ""}</p>
          </div>
          <Badge tone={label(QUOTE_STATUS, q.status).tone}>{label(QUOTE_STATUS, q.status).label}</Badge>
          <p className="font-semibold">{formatTND(q.total)}</p>
          <a href={`/documents/devis/${q.id}`} target="_blank" rel="noopener" className="text-sm font-semibold text-accent">Voir / imprimer</a>
        </li>
      ))}
    </ul>
  );
}

export default function QuotesPage() {
  return (
    <AccountShell title="Mes devis" current="/compte/devis">
      <Quotes />
    </AccountShell>
  );
}
