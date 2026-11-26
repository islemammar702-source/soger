import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerPrices, customers, invoices, orders, payments, products, quotes } from "@/db/schema";
import { CustomerForm } from "@/components/admin/party-forms";
import { Card, Flash, PageHeader, StatCard, Table, Td, Th, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS, ORDER_STATUS, PAYMENT_METHOD, QUOTE_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { removeCustomerPriceAction, setCustomerPriceAction, setPriceTierAction } from "@/server/admin/parties";
import { requireStaff } from "@/server/auth/dal";

export default async function CustomerPage({ params, searchParams }: PageProps<"/admin/clients/[id]">) {
  const me = await requireStaff("customers.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) notFound();
  const [ords, qts, invs, pays, prices, [totals]] = await Promise.all([
    db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt)).limit(20),
    db.select().from(quotes).where(eq(quotes.customerId, id)).orderBy(desc(quotes.createdAt)).limit(20),
    db.select().from(invoices).where(eq(invoices.customerId, id)).orderBy(desc(invoices.createdAt)).limit(20),
    db.select().from(payments).where(eq(payments.customerId, id)).orderBy(desc(payments.paidAt)).limit(20),
    db.select({ productId: customerPrices.productId, price: customerPrices.price, sku: products.sku, name: products.name, publicPrice: products.salePrice, proPrice: products.proPrice }).from(customerPrices).innerJoin(products, eq(products.id, customerPrices.productId)).where(eq(customerPrices.customerId, id)),
    db
      .select({
        revenue: sql<string>`coalesce((select sum(total) from ${orders} where customer_id = ${id} and status in ('confirmed','preparing','shipped','delivered')), 0)`,
        due: sql<string>`coalesce((select sum(case when kind = 'credit_note' then -(total - amount_paid) else total - amount_paid end) from ${invoices} where customer_id = ${id} and status in ('issued','partially_paid')), 0)`,
        overdue: sql<string>`coalesce((select sum(total - amount_paid) from ${invoices} where customer_id = ${id} and kind = 'customer' and status in ('issued','partially_paid') and due_date < current_date), 0)`,
        paid: sql<string>`coalesce((select sum(amount) from ${payments} where customer_id = ${id} and direction = 'in'), 0)`,
      })
      .from(customers)
      .where(eq(customers.id, id)),
  ]);
  const name = c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ");
  const canEdit = me.can("customers.update");
  const canBalance = me.can("customers.view_balance");
  return (
    <>
      <PageHeader
        title={name}
        description={<span className="font-mono">{c.code}{c.taxId ? ` · MF ${c.taxId}` : ""}</span>}
        back={{ href: "/admin/clients", label: "Clients" }}
        actions={
          <>
            {me.can("quotes.create") && <Link href={`/admin/devis/nouveau?client=${c.id}`} className={btn.outline}>Nouveau devis</Link>}
            {me.can("pos.use") && <Link href={`/admin/caisse?client=${c.id}`} className={btn.outline}>Vente en caisse</Link>}
            {canEdit && c.type === "professional" && (
              <form action={setPriceTierAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="tier" value={c.priceTier === "professional" ? "retail" : "professional"} />
                <button className={c.priceTier === "professional" ? btn.danger : btn.primary}>{c.priceTier === "professional" ? "Retirer les tarifs pros" : "Valider le compte pro"}</button>
              </form>
            )}
          </>
        }
      />
      <Flash sp={sp} />
      {canBalance && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <StatCard label="Chiffre d'affaires" value={formatTND(totals.revenue)} />
          <StatCard label="Solde dû" value={formatTND(totals.due)} tone={Number(totals.due) > 0 ? "warning" : "default"} sub={c.creditLimit ? `Plafond ${formatTND(c.creditLimit)}` : undefined} />
          <StatCard label="Échu (en retard)" value={formatTND(totals.overdue)} tone={Number(totals.overdue) > 0 ? "danger" : "default"} />
          <StatCard label="Total encaissé" value={formatTND(totals.paid)} />
        </div>
      )}
      <div className="mb-6 flex flex-wrap gap-2">
        {c.type === "professional" ? (c.priceTier === "professional" ? <Badge tone="bg-accent-soft text-accent-hover">Tarifs pros actifs</Badge> : <Badge tone="bg-amber-50 text-amber-700">Professionnel en attente de validation</Badge>) : <Badge>Particulier</Badge>}
        {c.userId ? <Badge tone="bg-sky-50 text-sky-700">Compte web</Badge> : <Badge>Sans compte web</Badge>}
      </div>
      <CustomerForm
        readOnly={!canEdit}
        values={{ id: c.id, type: c.type, companyName: c.companyName ?? "", firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "", taxId: c.taxId ?? "", activity: c.activity ?? "", address: c.address ?? "", city: c.city ?? "", governorate: c.governorate ?? "", postalCode: c.postalCode ?? "", creditLimit: c.creditLimit ? String(Number(c.creditLimit)) : "", notes: c.notes ?? "", isActive: c.isActive }}
      />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Commandes" padded={false}>
          <Table minWidth={480}>
            <tbody>
              {ords.length === 0 && <tr><Td className="text-steel">Aucune commande.</Td></tr>}
              {ords.map((o) => (
                <tr key={o.id}><Td><Link href={`/admin/commandes/${o.id}`} className="font-mono text-xs font-semibold text-accent">{o.number}</Link></Td><Td className="text-steel">{formatDate(o.createdAt)}</Td><Td><Badge tone={label(ORDER_STATUS, o.status).tone}>{label(ORDER_STATUS, o.status).label}</Badge></Td><Td className="text-right tabular-nums">{formatTND(o.total)}</Td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Devis" padded={false}>
          <Table minWidth={480}>
            <tbody>
              {qts.length === 0 && <tr><Td className="text-steel">Aucun devis.</Td></tr>}
              {qts.map((q) => (
                <tr key={q.id}><Td><Link href={`/admin/devis/${q.id}`} className="font-mono text-xs font-semibold text-accent">{q.number}</Link></Td><Td className="text-steel">{formatDate(q.createdAt)}</Td><Td><Badge tone={label(QUOTE_STATUS, q.status).tone}>{label(QUOTE_STATUS, q.status).label}</Badge></Td><Td className="text-right tabular-nums">{formatTND(q.total)}</Td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {canBalance && (
          <>
            <Card title="Factures" padded={false}>
              <Table minWidth={480}>
                <tbody>
                  {invs.length === 0 && <tr><Td className="text-steel">Aucune facture.</Td></tr>}
                  {invs.map((f) => (
                    <tr key={f.id}><Td><Link href={`/admin/factures/${f.id}`} className="font-mono text-xs font-semibold text-accent">{f.number}</Link></Td><Td className="text-steel">{formatDate(f.issueDate)}</Td><Td><Badge tone={label(INVOICE_STATUS, f.status).tone}>{label(INVOICE_STATUS, f.status).label}</Badge></Td><Td className="text-right tabular-nums">{formatTND(f.total)}<span className="block text-xs text-steel">reste {formatTND(Number(f.total) - Number(f.amountPaid))}</span></Td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card title="Paiements" padded={false}>
              <Table minWidth={480}>
                <tbody>
                  {pays.length === 0 && <tr><Td className="text-steel">Aucun paiement.</Td></tr>}
                  {pays.map((p) => (
                    <tr key={p.id}><Td className="text-steel">{formatDate(p.paidAt)}</Td><Td>{PAYMENT_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ""}</Td><Td className={`text-right font-semibold tabular-nums ${p.direction === "out" ? "text-danger" : ""}`}>{p.direction === "out" ? "-" : ""}{formatTND(p.amount)}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </>
        )}
      </div>
      <Card title="Prix négociés (HT)" className="mt-6" padded={false}>
        <div id="prix" />
        <Table minWidth={640}>
          <thead><tr><Th>Référence</Th><Th>Désignation</Th><Th className="text-right">Public</Th><Th className="text-right">Pro</Th><Th className="text-right">Négocié</Th><Th /></tr></thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.productId}>
                <Td className="font-mono text-xs">{p.sku}</Td><Td>{p.name}</Td><Td className="text-right text-steel">{formatTND(p.publicPrice)}</Td><Td className="text-right text-steel">{formatTND(p.proPrice)}</Td><Td className="text-right font-semibold">{formatTND(p.price)}</Td>
                <Td className="text-right">{canEdit && <form action={removeCustomerPriceAction}><input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="productId" value={p.productId} /><button className="text-xs text-danger">Retirer</button></form>}</Td>
              </tr>
            ))}
            {canEdit && (
              <tr>
                <Td colSpan={6}>
                  <form action={setCustomerPriceAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="customerId" value={c.id} />
                    <input name="sku" placeholder="Référence SOGER" required className="h-9 w-48 rounded-md border border-line px-2.5 font-mono text-sm uppercase" />
                    <input name="price" placeholder="Prix HT" required inputMode="decimal" className="h-9 w-32 rounded-md border border-line px-2.5 text-sm" />
                    <button className="h-9 rounded-md bg-ink px-3 text-xs font-medium text-white">Ajouter / modifier</button>
                    <span className="text-xs text-steel">Prioritaire sur le prix public et le prix pro.</span>
                  </form>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
