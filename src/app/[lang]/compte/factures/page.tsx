import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { getI18n } from "@/i18n/server";
import { INVOICE_STATUS, label } from "@/lib/labels";
import { getMyBalance, getMyInvoices, getMyPayments } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.invoicesTitle, robots: { index: false } };
}

async function Invoices() {
  const { t, fmt, money, date, status, href } = await getI18n();
  const a = t.account;
  const { customer } = await requireCustomer(href("/compte/factures"));
  const [invoices, payments, balance] = await Promise.all([getMyInvoices(customer.id), getMyPayments(customer.id), getMyBalance(customer.id)]);
  return (
    <div className="space-y-8">
      <div className="rounded-[var(--radius-card)] border border-line bg-white p-5">
        <p className="text-sm text-steel">{a.balance}</p>
        <p className="font-display text-3xl font-bold">{money(balance)}</p>
      </div>
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">{a.invoices}</h2>
        {invoices.length ? (
          <ul className="space-y-3">
            {invoices.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
                <div>
                  <p className="font-mono font-semibold">{f.number}{f.kind === "credit_note" && a.creditNote}</p>
                  <p className="text-xs text-steel">{fmt(a.issued, { date: date(f.issueDate) })}{f.dueDate ? ` · ${fmt(a.due, { date: date(f.dueDate) })}` : ""}</p>
                </div>
                <Badge tone={label(INVOICE_STATUS, f.status).tone}>{status("invoice", f.status)}</Badge>
                <p className="text-end"><span className="font-semibold">{money(f.total)}</span><span className="block text-xs text-steel">{fmt(a.paid, { amount: money(f.amountPaid) })}</span></p>
                <a href={`/documents/facture/${f.id}`} target="_blank" rel="noopener" className="text-sm font-semibold text-accent">{a.viewPrint}</a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={a.noInvoices} />
        )}
      </div>
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">{a.payments}</h2>
        {payments.length ? (
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between px-4 py-3 text-sm">
                <span>{date(p.paidAt)} · {status("method", p.method)}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span className="font-semibold">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={a.noPayments} />
        )}
      </div>
    </div>
  );
}

export default async function InvoicesPage() {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.invoicesTitle} current="/compte/factures">
      <Invoices />
    </AccountShell>
  );
}
