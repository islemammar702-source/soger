import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cashSessions, customers, invoices, orderItems, orders, payments, quotes, users } from "@/db/schema";
import { Card, Flash, PageHeader, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CHANNEL, INVOICE_STATUS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, formatDateTime, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { addPaymentAction, deletePaymentAction, invoiceOrderAction, orderReturnAction, orderStepAction, setOrderCustomerAction } from "@/server/admin/sales";
import { requireStaff } from "@/server/auth/dal";

function Step({ id, step, label: text, tone = btn.outline }: { id: number; step: string; label: string; tone?: string }) {
  return <form action={orderStepAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value={step} /><button className={tone}>{text}</button></form>;
}

export default async function OrderPage({ params, searchParams }: PageProps<"/admin/commandes/[id]">) {
  const me = await requireStaff("orders.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) notFound();
  const [items, [c], pays, invs, [q], [creator], [openSession]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.sortOrder)),
    o.customerId ? db.select().from(customers).where(eq(customers.id, o.customerId)) : Promise.resolve([]),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.paidAt)),
    db.select().from(invoices).where(eq(invoices.orderId, id)),
    o.quoteId ? db.select({ id: quotes.id, number: quotes.number }).from(quotes).where(eq(quotes.id, o.quoteId)) : Promise.resolve([]),
    o.createdBy ? db.select({ name: users.name }).from(users).where(eq(users.id, o.createdBy)) : Promise.resolve([]),
    db.select({ id: cashSessions.id }).from(cashSessions).where(isNull(cashSessions.closedAt)).limit(1),
  ]);
  const s = o.status;
  const canUpdate = me.can("orders.update");
  const invoice = invs.find((i) => i.kind === "customer" && i.status !== "cancelled");
  const remaining = Number(invoice ? Number(invoice.total) - Number(invoice.amountPaid) : Number(o.total) - Number(o.amountPaid));
  const name = c ? c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") : o.shippingName || "Client de passage";
  return (
    <>
      <PageHeader
        title={`Commande ${o.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={label(ORDER_STATUS, s).tone}>{label(ORDER_STATUS, s).label}</Badge><Badge tone={label(PAYMENT_STATUS, o.paymentStatus).tone}>{label(PAYMENT_STATUS, o.paymentStatus).label}</Badge>{CHANNEL[o.channel]} · {formatDateTime(o.createdAt)}{creator ? ` · ${creator.name}` : ""}</span>}
        back={{ href: "/admin/commandes", label: "Commandes" }}
        actions={
          <>
            {o.channel === "store" && <a href={`/documents/ticket/${id}`} target="_blank" className={btn.outline}>Ticket</a>}
            <a href={`/documents/commande/${id}`} target="_blank" className={btn.outline}>Bon de livraison</a>
            {canUpdate && s === "pending" && <Step id={id} step="confirm" label="Confirmer (réserver le stock)" tone={btn.primary} />}
            {canUpdate && s === "confirmed" && <Step id={id} step="preparing" label="En préparation" />}
            {canUpdate && ["confirmed", "preparing"].includes(s) && <Step id={id} step="ship" label="Expédiée" />}
            {canUpdate && ["confirmed", "preparing", "shipped"].includes(s) && <Step id={id} step="deliver" label="Livrée / remise (sortie de stock)" tone={btn.primary} />}
            {me.can("orders.cancel") && ["pending", "confirmed", "preparing", "shipped"].includes(s) && <Step id={id} step="cancel" label="Annuler" tone={btn.danger} />}
            {me.can("invoices.create") && !invoice && s !== "cancelled" && o.customerId && <form action={invoiceOrderAction}><input type="hidden" name="id" value={id} /><button className={btn.dark}>Facturer</button></form>}
          </>
        }
      />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="Articles" padded={false}>
            <form action={orderReturnAction}>
              <input type="hidden" name="id" value={id} />
              <table className="w-full text-sm">
                <thead className="bg-mist/60 text-xs text-steel uppercase"><tr><th className="p-3 text-left">Article</th><th className="p-3 text-right">Qté</th><th className="p-3 text-right">PU HT</th><th className="p-3 text-right">Total HT</th>{s === "delivered" && me.can("orders.return") && <th className="p-3 text-right">Retour</th>}</tr></thead>
                <tbody>
                  {items.map((i) => {
                    const returnable = Number(i.quantity) - Number(i.quantityReturned);
                    return (
                      <tr key={i.id} className="border-t border-line">
                        <td className="p-3">{i.productId ? <Link href={`/admin/produits/${i.productId}`} className="hover:text-accent">{i.description}</Link> : i.description}<p className="font-mono text-xs text-steel">{i.sku}{Number(i.quantityReturned) > 0 && <span className="ml-2 font-sans text-violet-700">{Number(i.quantityReturned)} retourné(s)</span>}</p></td>
                        <td className="p-3 text-right tabular-nums">{Number(i.quantity)}</td>
                        <td className="p-3 text-right tabular-nums">{formatTND(i.unitPrice)}{Number(i.discountRate) > 0 && <span className="block text-xs text-steel">−{Number(i.discountRate)} %</span>}</td>
                        <td className="p-3 text-right font-medium tabular-nums">{formatTND(i.lineTotal)}</td>
                        {s === "delivered" && me.can("orders.return") && <td className="p-3 text-right">{returnable > 0 && i.productId ? <input name={`r_${i.id}`} placeholder="0" inputMode="decimal" aria-label={`Quantité retournée ${i.sku}`} className="h-8 w-16 rounded-md border border-line px-2 text-right" /> : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(s === "delivered" || s === "returned") && me.can("orders.return") && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-sm">
                  <span className="text-steel">Retour client : remise en stock et remboursement éventuel</span>
                  <input name="refund" placeholder="Remboursement (DT)" inputMode="decimal" className="h-9 w-40 rounded-md border border-line px-2" />
                  <select name="method" className="h-9 rounded-md border border-line px-2">{["cash", "card", "transfer", "check"].map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>)}</select>
                  {openSession && <input type="hidden" name="cashSessionId" value={openSession.id} />}
                  <button className="h-9 rounded-md bg-ink px-3 text-xs font-medium text-white">Enregistrer le retour</button>
                </div>
              )}
            </form>
            <dl className="space-y-1 border-t border-line p-4 text-sm">
              <div className="flex justify-between"><dt className="text-steel">Sous-total HT</dt><dd>{formatTND(o.subtotal)}</dd></div>
              {Number(o.discountTotal) > 0 && <div className="flex justify-between"><dt className="text-steel">Remises</dt><dd>−{formatTND(o.discountTotal)}</dd></div>}
              {Number(o.shippingTotal) > 0 && <div className="flex justify-between"><dt className="text-steel">Livraison HT</dt><dd>{formatTND(o.shippingTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="text-steel">TVA</dt><dd>{formatTND(o.vatTotal)}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total TTC</dt><dd>{formatTND(o.total)}</dd></div>
            </dl>
          </Card>
          {o.notes && <Card title="Remarques"><p className="text-sm whitespace-pre-line">{o.notes}</p></Card>}
        </div>
        <div className="space-y-6">
          <Card title="Client">
            <p className="font-semibold">{c ? <Link href={`/admin/clients/${c.id}`} className="hover:text-accent">{name}</Link> : name}</p>
            {c && <p className="font-mono text-xs text-steel">{c.code}{c.taxId ? ` · MF ${c.taxId}` : ""}</p>}
            <p className="mt-2 text-sm text-steel">{o.shippingPhone ?? c?.phone}</p>
            <p className="mt-2 text-sm">{o.deliveryMethod}</p>
            {o.shippingAddress && <p className="text-sm text-steel">{[o.shippingAddress, o.shippingPostalCode, o.shippingCity, o.shippingGovernorate].filter(Boolean).join(", ")}</p>}
            {q && <p className="mt-2 text-sm">Devis : <Link href={`/admin/devis/${q.id}`} className="font-mono text-accent">{q.number}</Link></p>}
            {!c && canUpdate && (
              <form action={setOrderCustomerAction} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={id} />
                <input name="code" placeholder="Code client (CLI-…)" className="h-9 flex-1 rounded-md border border-line px-2 font-mono text-xs uppercase" />
                <button className="h-9 rounded-md bg-ink px-3 text-xs text-white">Associer</button>
              </form>
            )}
          </Card>
          {invs.length > 0 && (
            <Card title="Facturation">
              {invs.map((f) => <p key={f.id} className="flex justify-between text-sm"><Link href={`/admin/factures/${f.id}`} className="font-mono text-accent">{f.number}</Link><Badge tone={label(INVOICE_STATUS, f.status).tone}>{label(INVOICE_STATUS, f.status).label}</Badge></p>)}
            </Card>
          )}
          <Card title="Paiements">
            <ul className="space-y-1.5 text-sm">
              {pays.length === 0 && <li className="text-steel">Aucun paiement.</li>}
              {pays.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>{formatDateTime(p.paidAt)} · {PAYMENT_METHOD[p.method]}{p.direction === "out" && " (remboursement)"}</span>
                  <span className="flex items-center gap-2 font-semibold tabular-nums">{p.direction === "out" ? "−" : ""}{formatTND(p.amount)}
                    {me.can("payments.delete") && <form action={deletePaymentAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={`/admin/commandes/${id}`} /><button className="text-xs font-normal text-danger" aria-label="Supprimer le paiement">×</button></form>}
                  </span>
                </li>
              ))}
            </ul>
            {me.can("payments.create") && remaining > 0.0005 && s !== "cancelled" && (
              <form action={addPaymentAction} className="mt-4 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="back" value={`/admin/commandes/${id}`} />
                {invoice ? <input type="hidden" name="invoiceId" value={invoice.id} /> : <input type="hidden" name="orderId" value={id} />}
                <p className="text-sm">Reste à payer : <strong>{formatTND(remaining)}</strong></p>
                <div className="flex gap-2">
                  <input name="amount" defaultValue={remaining.toFixed(3)} inputMode="decimal" className="h-9 w-28 rounded-md border border-line px-2 text-right" aria-label="Montant" />
                  <select name="method" className="h-9 flex-1 rounded-md border border-line px-2 text-sm">{Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </div>
                <input name="reference" placeholder="Référence (chèque, virement…)" className="h-9 w-full rounded-md border border-line px-2 text-sm" />
                <button className="h-9 w-full rounded-md bg-accent text-sm font-medium text-white">Enregistrer le paiement</button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
