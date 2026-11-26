import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoiceItems, invoices, orders, payments } from "@/db/schema";
import { Card, Flash, PageHeader, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS, PAYMENT_METHOD, formatDate, formatDateTime, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { addPaymentAction, creditNoteAction, deletePaymentAction } from "@/server/admin/sales";
import { requireStaff } from "@/server/auth/dal";
import { documentUrl } from "@/server/documents";

export default async function InvoicePage({ params, searchParams }: PageProps<"/admin/factures/[id]">) {
  const me = await requireStaff("invoices.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [f] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!f) notFound();
  const [items, pays, [order], credited] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.paidAt)),
    f.orderId ? db.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.id, f.orderId)) : Promise.resolve([]),
    db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.creditedInvoiceId, id)),
  ]);
  const rest = Number(f.total) - Number(f.amountPaid);
  const kind = f.kind === "supplier" ? "Facture fournisseur" : f.kind === "credit_note" ? "Avoir" : "Facture";
  return (
    <>
      <PageHeader
        title={`${kind} ${f.number}`}
        description={<span className="flex items-center gap-2"><Badge tone={label(INVOICE_STATUS, f.status).tone}>{label(INVOICE_STATUS, f.status).label}</Badge>{f.billingName} · émise le {formatDate(f.issueDate)}{f.dueDate ? ` · échéance ${formatDate(f.dueDate)}` : ""}</span>}
        back={{ href: "/admin/factures", label: "Factures" }}
        actions={
          <>
            {f.kind !== "supplier" && <a href={`/documents/facture/${id}`} target="_blank" className={btn.outline}>PDF / Imprimer</a>}
            {f.kind === "customer" && me.can("invoices.cancel") && f.status !== "cancelled" && credited.length === 0 && <form action={creditNoteAction}><input type="hidden" name="id" value={id} /><button className={btn.danger}>Émettre un avoir</button></form>}
          </>
        }
      />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card title="Détail" padded={false}>
          {items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-mist/60 text-xs text-steel uppercase"><tr><th className="p-3 text-left">Désignation</th><th className="p-3 text-right">Qté</th><th className="p-3 text-right">PU HT</th><th className="p-3 text-right">TVA</th><th className="p-3 text-right">Total HT</th></tr></thead>
              <tbody>{items.map((i) => <tr key={i.id} className="border-t border-line"><td className="p-3">{i.description}<p className="font-mono text-xs text-steel">{i.sku}</p></td><td className="p-3 text-right">{Number(i.quantity)}</td><td className="p-3 text-right">{formatTND(i.unitPrice)}{Number(i.discountRate) ? <span className="block text-xs text-steel">−{Number(i.discountRate)} %</span> : null}</td><td className="p-3 text-right">{Number(i.vatRate)} %</td><td className="p-3 text-right font-medium">{formatTND(i.lineTotal)}</td></tr>)}</tbody>
            </table>
          ) : <p className="p-5 text-sm text-steel">Facture saisie en montants globaux{f.externalRef ? ` (réf. fournisseur ${f.externalRef})` : ""}.</p>}
          <dl className="space-y-1 border-t border-line p-4 text-sm">
            <div className="flex justify-between"><dt className="text-steel">Total HT</dt><dd>{formatTND(Number(f.subtotal) - Number(f.discountTotal))}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">TVA</dt><dd>{formatTND(f.vatTotal)}</dd></div>
            {Number(f.stampDuty) > 0 && <div className="flex justify-between"><dt className="text-steel">Droit de timbre</dt><dd>{formatTND(f.stampDuty)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>Total TTC</dt><dd>{formatTND(f.total)}</dd></div>
          </dl>
        </Card>
        <div className="space-y-6">
          <Card title="Liens">
            <ul className="space-y-1 text-sm">
              {order && <li>Commande : <Link href={`/admin/commandes/${order.id}`} className="font-mono text-accent">{order.number}</Link></li>}
              {f.purchaseOrderId && <li>Commande fournisseur : <Link href={`/admin/achats/${f.purchaseOrderId}`} className="text-accent">voir</Link></li>}
              {f.customerId && <li>Client : <Link href={`/admin/clients/${f.customerId}`} className="text-accent">fiche client</Link></li>}
              {f.supplierId && <li>Fournisseur : <Link href={`/admin/fournisseurs/${f.supplierId}`} className="text-accent">fiche fournisseur</Link></li>}
              {f.creditedInvoiceId && <li>Avoir sur : <Link href={`/admin/factures/${f.creditedInvoiceId}`} className="text-accent">facture d&apos;origine</Link></li>}
              {credited.map((c) => <li key={c.id}>Avoir : <Link href={`/admin/factures/${c.id}`} className="font-mono text-accent">{c.number}</Link></li>)}
              {f.kind === "customer" && <li className="pt-2 text-xs text-steel">Lien client : <code className="break-all">{documentUrl("facture", id)}</code></li>}
            </ul>
          </Card>
          <Card title={f.kind === "customer" ? "Encaissements" : "Règlements"}>
            <ul className="space-y-1.5 text-sm">
              {pays.length === 0 && <li className="text-steel">Aucun paiement.</li>}
              {pays.map((p) => (
                <li key={p.id} className="flex justify-between gap-2"><span>{formatDateTime(p.paidAt)} · {PAYMENT_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ""}</span><span className="flex gap-2 font-semibold tabular-nums">{formatTND(p.amount)}{me.can("payments.delete") && <form action={deletePaymentAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={`/admin/factures/${id}`} /><button className="text-xs font-normal text-danger" aria-label="Supprimer">×</button></form>}</span></li>
              ))}
            </ul>
            {me.can("payments.create") && rest > 0.0005 && ["issued", "partially_paid"].includes(f.status) && (
              <form action={addPaymentAction} className="mt-4 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="invoiceId" value={id} /><input type="hidden" name="back" value={`/admin/factures/${id}`} />
                <p className="text-sm">Reste {f.kind === "customer" ? "à encaisser" : "à régler"} : <strong>{formatTND(rest)}</strong></p>
                <div className="flex gap-2">
                  <input name="amount" defaultValue={rest.toFixed(3)} inputMode="decimal" className="h-9 w-28 rounded-md border border-line px-2 text-right" aria-label="Montant" />
                  <select name="method" className="h-9 flex-1 rounded-md border border-line px-2 text-sm">{Object.entries(PAYMENT_METHOD).filter(([k]) => k !== "cash_on_delivery").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </div>
                <input name="reference" placeholder="Référence (chèque, virement…)" className="h-9 w-full rounded-md border border-line px-2 text-sm" />
                <button className="h-9 w-full rounded-md bg-accent text-sm font-medium text-white">Enregistrer</button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
