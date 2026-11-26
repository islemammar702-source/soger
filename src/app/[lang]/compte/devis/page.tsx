import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { getI18n } from "@/i18n/server";
import { QUOTE_STATUS, label } from "@/lib/labels";
import { getMyQuotes } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.quotesTitle, robots: { index: false } };
}

async function Quotes() {
  const { t, fmt, plural, money, date, status, href } = await getI18n();
  const a = t.account;
  const { customer } = await requireCustomer(href("/compte/devis"));
  const quotes = await getMyQuotes(customer.id);
  if (!quotes.length) return <EmptyState title={a.noQuotes} text={a.noQuotesText} href="/devis" cta={a.requestQuote} />;
  return (
    <ul className="space-y-3">
      {quotes.map((q) => (
        <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
          <div>
            <p className="font-mono font-semibold">{q.number}</p>
            <p className="text-xs text-steel">{date(q.createdAt)} · {plural(a.lines, q.lines)}{q.validUntil ? ` · ${fmt(a.validUntil, { date: date(q.validUntil) })}` : ""}</p>
          </div>
          <Badge tone={label(QUOTE_STATUS, q.status).tone}>{status("quote", q.status)}</Badge>
          <p className="font-semibold">{money(q.total)}</p>
          <a href={`/documents/devis/${q.id}`} target="_blank" rel="noopener" className="text-sm font-semibold text-accent">{a.viewPrint}</a>
        </li>
      ))}
    </ul>
  );
}

export default async function QuotesPage() {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.quotesTitle} current="/compte/devis">
      <Quotes />
    </AccountShell>
  );
}
