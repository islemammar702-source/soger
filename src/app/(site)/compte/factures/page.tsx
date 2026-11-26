import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS, PAYMENT_METHOD, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { getMyBalance, getMyInvoices, getMyPayments } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Factures et paiements", robots: { index: false } };

async function Invoices() {
  const { customer } = await requireCustomer("/compte/factures");
  const [invoices, payments, balance] = await Promise.all([getMyInvoices(customer.id), getMyPayments(customer.id), getMyBalance(customer.id)]);
  return (
    <div className="space-y-8">
      <div className="rounded-[var(--radius-card)] border border-line bg-white p-5">
        <p className="text-sm text-steel">Reste à payer</p>
        <p className="font-display text-3xl font-bold">{formatTND(balance)}</p>
      </div>
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">Factures</h2>
        {invoices.length ? (
          <ul className="space-y-3">
            {invoices.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
                <div>
                  <p className="font-mono font-semibold">{f.number}{f.kind === "credit_note" && " (avoir)"}</p>
                  <p className="text-xs text-steel">Émise le {formatDate(f.issueDate)}{f.dueDate ? ` · échéance ${formatDate(f.dueDate)}` : ""}</p>
                </div>
                <Badge tone={label(INVOICE_STATUS, f.status).tone}>{label(INVOICE_STATUS, f.status).label}</Badge>
                <p className="text-right"><span className="font-semibold">{formatTND(f.total)}</span><span className="block text-xs text-steel">payé {formatTND(f.amountPaid)}</span></p>
                <a href={`/documents/facture/${f.id}`} target="_blank" rel="noopener" className="text-sm font-semibold text-accent">Voir / imprimer</a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune facture" />
        )}
      </div>
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">Paiements</h2>
        {payments.length ? (
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between px-4 py-3 text-sm">
                <span>{formatDate(p.paidAt)} · {PAYMENT_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span className="font-semibold">{formatTND(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucun paiement enregistré" />
        )}
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <AccountShell title="Factures et paiements" current="/compte/factures">
      <Invoices />
    </AccountShell>
  );
}
