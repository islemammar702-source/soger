import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Package, Printer } from "lucide-react";
import { db } from "@/db";
import { brands, customers, invoices, orderItems, orders, payments, productImages, products, users } from "@/db/schema";
import { Card, Flash, PageHeader, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, formatDateTime, label } from "@/lib/labels";
import { formatTND, isOptimizable } from "@/lib/utils";
import { getOpenSession } from "@/server/admin/caisse-queries";
import { posPaymentAction } from "@/server/admin/pos";
import { orderReturnAction } from "@/server/admin/sales";
import { requireStaff } from "@/server/auth/dal";
import { customerDueFor } from "@/server/receivables";

export function generateStaticParams() {
  return [{ id: "0" }];
}

export default async function SalePage({ params, searchParams }: PageProps<"/admin/caisse/ventes/[id]">) {
  const me = await requireStaff("pos.use");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [o] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.channel, "store")));
  if (!o) notFound();
  const [items, [c], pays, [inv], [seller], open] = await Promise.all([
    db
      .select({ i: orderItems, mref: products.manufacturerRef, brand: brands.name, image: sql<string | null>`(select pi.url from ${productImages} pi where pi.product_id = ${orderItems.productId} order by pi.is_primary desc, pi.sort_order limit 1)` })
      .from(orderItems)
      .leftJoin(products, eq(products.id, orderItems.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.sortOrder)),
    o.customerId ? db.select({ c: customers, due: customerDueFor(o.customerId) }).from(customers).where(eq(customers.id, o.customerId)) : Promise.resolve([]),
    db.select({ p: payments, user: users.name }).from(payments).leftJoin(users, eq(users.id, payments.recordedBy)).where(eq(payments.orderId, id)).orderBy(desc(payments.paidAt)),
    db.select().from(invoices).where(and(eq(invoices.orderId, id), eq(invoices.kind, "customer"), sql`${invoices.status} <> 'cancelled'`)),
    o.createdBy ? db.select({ name: users.name }).from(users).where(eq(users.id, o.createdBy)) : Promise.resolve([]),
    getOpenSession(),
  ]);
  const total = Number(inv?.total ?? o.total);
  const paid = Number(inv?.amountPaid ?? o.amountPaid);
  const rest = Math.max(0, total - paid);
  const name = c ? c.c.companyName || [c.c.firstName, c.c.lastName].filter(Boolean).join(" ") : "Client de passage";
  const canReturn = me.can("orders.return") && ["delivered", "returned"].includes(o.status);
  return (
    <>
      <PageHeader
        title={`Vente ${o.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={label(ORDER_STATUS, o.status).tone}>{label(ORDER_STATUS, o.status).label}</Badge><Badge tone={label(PAYMENT_STATUS, o.paymentStatus).tone}>{label(PAYMENT_STATUS, o.paymentStatus).label}</Badge>{formatDateTime(o.createdAt)} · {seller?.name ?? "—"}</span>}
        back={{ href: "/admin/caisse/ventes", label: "Historique des ventes" }}
        actions={
          <>
            <a href={`/documents/ticket/${id}`} target="_blank" className={btn.outline}><Printer className="size-4" /> Imprimer le ticket</a>
            {inv && <a href={`/documents/facture/${inv.id}`} target="_blank" className={btn.outline}>Facture {inv.number}</a>}
          </>
        }
      />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card title="Produits vendus" padded={false}>
          <form action={orderReturnAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value="caisse" />
            {open && <input type="hidden" name="cashSessionId" value={open.s.id} />}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-mist/60 text-xs text-steel uppercase"><tr><th className="w-14 p-3" /><th className="p-3 text-left">Produit</th><th className="p-3 text-left">Réf. SOGER / fabricant</th><th className="p-3 text-right">Qté</th><th className="p-3 text-right">PU HT</th><th className="p-3 text-right">Remise</th><th className="p-3 text-right">Total HT</th>{canReturn && <th className="p-3 text-right">Retour</th>}</tr></thead>
                <tbody>
                  {items.map(({ i, mref, brand, image }) => {
                    const returnable = Number(i.quantity) - Number(i.quantityReturned);
                    return (
                      <tr key={i.id} className="border-t border-line">
                        <td className="p-2"><div className="relative grid size-11 place-items-center overflow-hidden rounded-lg bg-mist">{image ? <Image src={image} alt="" fill sizes="44px" className="object-contain p-1" unoptimized={!isOptimizable(image)} /> : <Package className="size-5 text-steel/50" />}</div></td>
                        <td className="p-3"><p className="font-medium">{i.description}</p><p className="text-xs text-steel">{brand}{Number(i.quantityReturned) > 0 && <span className="ml-2 text-violet-700">{Number(i.quantityReturned)} retourné(s)</span>}</p></td>
                        <td className="p-3 font-mono text-xs">{i.sku}<span className="block text-steel">{mref ?? ""}</span></td>
                        <td className="p-3 text-right tabular-nums">{Number(i.quantity)}</td>
                        <td className="p-3 text-right tabular-nums">{formatTND(i.unitPrice)}</td>
                        <td className="p-3 text-right">{Number(i.discountRate) ? `${Number(i.discountRate)} %` : "—"}</td>
                        <td className="p-3 text-right font-medium tabular-nums">{formatTND(i.lineTotal)}</td>
                        {canReturn && <td className="p-3 text-right">{returnable > 0 && i.productId ? <input name={`r_${i.id}`} placeholder="0" inputMode="decimal" aria-label={`Quantité retournée ${i.sku}`} className="h-8 w-16 rounded-md border border-line px-2 text-right" /> : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canReturn && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-sm">
                <span className="text-steel">Retour : remise en stock{open ? " et remboursement éventuel en caisse" : " (ouvrez la caisse pour rembourser)"}</span>
                {open && <input name="refund" placeholder="Remboursement (DT)" inputMode="decimal" className="h-9 w-40 rounded-md border border-line px-2" />}
                {open && <select name="method" className="h-9 rounded-md border border-line px-2">{["cash", "card", "transfer", "check"].map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>)}</select>}
                <button className="h-9 rounded-md bg-ink px-3 text-xs font-medium text-white">Enregistrer le retour</button>
              </div>
            )}
          </form>
          <dl className="space-y-1 border-t border-line p-4 text-sm">
            <div className="flex justify-between"><dt className="text-steel">Total HT</dt><dd>{formatTND(Number(o.subtotal) - Number(o.discountTotal))}</dd></div>
            {Number(o.discountTotal) > 0 && <div className="flex justify-between"><dt className="text-steel">dont remises</dt><dd>−{formatTND(o.discountTotal)}</dd></div>}
            <div className="flex justify-between"><dt className="text-steel">TVA</dt><dd>{formatTND(o.vatTotal)}</dd></div>
            {inv && Number(inv.stampDuty) > 0 && <div className="flex justify-between"><dt className="text-steel">Droit de timbre</dt><dd>{formatTND(inv.stampDuty)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>Total TTC</dt><dd>{formatTND(total)}</dd></div>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title="Client">
            {c ? (
              <>
                <Link href={`/admin/clients/${c.c.id}`} className="font-semibold hover:text-accent">{name}</Link>
                <p className="font-mono text-xs text-steel">{c.c.code}{c.c.taxId ? ` · MF ${c.c.taxId}` : ""}</p>
                <p className="text-sm text-steel">{c.c.phone}</p>
                <p className="mt-3 text-sm">Solde total du client : <strong className={Number(c.due) > 0 ? "text-amber-700" : ""}>{formatTND(c.due)}</strong></p>
              </>
            ) : (
              <p className="text-sm text-steel">Vente sans client enregistré.</p>
            )}
          </Card>

          <Card title="Paiements">
            <dl className="mb-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-steel">Total</dt><dd className="tabular-nums">{formatTND(total)}</dd></div>
              <div className="flex justify-between"><dt className="text-steel">Montant payé</dt><dd className="tabular-nums">{formatTND(paid)}</dd></div>
              <div className={`flex justify-between font-semibold ${rest > 0.0005 ? "text-amber-700" : ""}`}><dt>Reste à payer</dt><dd className="tabular-nums">{formatTND(rest)}</dd></div>
            </dl>
            <ul className="space-y-1.5 border-t border-line pt-3 text-sm">
              {pays.length === 0 && <li className="text-steel">Aucun paiement (vente à crédit).</li>}
              {pays.map(({ p, user }) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{formatDateTime(p.paidAt)} · {PAYMENT_METHOD[p.method]}{p.direction === "out" ? " (remboursement)" : p.notes === "Paiement complémentaire" ? " (complément)" : ""}<span className="block text-xs text-steel">{user}{p.reference ? ` · ${p.reference}` : ""}</span></span>
                  <span className={`font-semibold tabular-nums ${p.direction === "out" ? "text-danger" : ""}`}>{p.direction === "out" ? "−" : ""}{formatTND(p.amount)}</span>
                </li>
              ))}
            </ul>
            {rest > 0.0005 && me.can("payments.create") && o.status !== "cancelled" && (
              <form id="paiement" action={posPaymentAction} className="mt-4 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="orderId" value={id} />
                <p className="text-sm font-semibold">Paiement complémentaire</p>
                {open ? (
                  <>
                    <div className="flex gap-2">
                      <input name="amount" defaultValue={rest.toFixed(3)} inputMode="decimal" aria-label="Montant" className="h-10 w-32 rounded-md border border-line px-2 text-right tabular-nums" />
                      <select name="method" aria-label="Mode de paiement" className="h-10 flex-1 rounded-md border border-line px-2 text-sm">{["cash", "card", "transfer", "check"].map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>)}</select>
                    </div>
                    <input name="reference" placeholder="Référence (chèque, virement…)" className="h-10 w-full rounded-md border border-line px-2 text-sm" />
                    <button className="h-10 w-full rounded-md bg-accent text-sm font-medium text-white hover:bg-accent-hover">Encaisser</button>
                    <p className="text-xs text-steel">Encaissé dans la caisse ouverte (n°{open.s.id}) et déduit du solde du client.</p>
                  </>
                ) : (
                  <p className="text-sm text-amber-700">Ouvrez la caisse pour encaisser un paiement.</p>
                )}
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Données en temps réel : la navigation attend le serveur, un écran de chargement s'affiche. */
export const instant = false;
