import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, productSuppliers, products, purchaseOrders, suppliers } from "@/db/schema";
import { SupplierForm } from "@/components/admin/party-forms";
import { Card, Flash, PageHeader, StatCard, Table, Td, Th, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS, PAYMENT_METHOD, PO_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { removeSupplierProductAction, setSupplierProductAction } from "@/server/admin/parties";
import { requireStaff } from "@/server/auth/dal";

export default async function SupplierPage({ params, searchParams }: PageProps<"/admin/fournisseurs/[id]">) {
  const me = await requireStaff("suppliers.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!s) notFound();
  const [items, pos, invs, pays, [t]] = await Promise.all([
    db.select({ ps: productSuppliers, sku: products.sku, name: products.name, cost: products.purchasePrice }).from(productSuppliers).innerJoin(products, eq(products.id, productSuppliers.productId)).where(eq(productSuppliers.supplierId, id)).orderBy(products.sku),
    db.select().from(purchaseOrders).where(eq(purchaseOrders.supplierId, id)).orderBy(desc(purchaseOrders.createdAt)).limit(20),
    db.select().from(invoices).where(eq(invoices.supplierId, id)).orderBy(desc(invoices.createdAt)).limit(20),
    db.select().from(payments).where(eq(payments.supplierId, id)).orderBy(desc(payments.paidAt)).limit(20),
    db
      .select({
        purchased: sql<string>`coalesce((select sum(total) from ${purchaseOrders} where supplier_id = ${id} and status <> 'cancelled'), 0)`,
        debt: sql<string>`coalesce((select sum(total - amount_paid) from ${invoices} where supplier_id = ${id} and kind = 'supplier' and status in ('issued','partially_paid')), 0)`,
        paid: sql<string>`coalesce((select sum(amount) from ${payments} where supplier_id = ${id} and direction = 'out'), 0)`,
      })
      .from(suppliers)
      .where(eq(suppliers.id, id)),
  ]);
  const canEdit = me.can("suppliers.update");
  return (
    <>
      <PageHeader title={s.name} description={<span className="font-mono">{s.code}</span>} back={{ href: "/admin/fournisseurs", label: "Fournisseurs" }} actions={me.can("purchases.create") && <Link href={`/admin/achats/nouveau?fournisseur=${s.id}`} className={btn.primary}>Nouvelle commande fournisseur</Link>} />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Achats commandés" value={formatTND(t.purchased)} />
        <StatCard label="Dette (factures non réglées)" value={formatTND(t.debt)} tone={Number(t.debt) > 0 ? "warning" : "default"} />
        <StatCard label="Total réglé" value={formatTND(t.paid)} />
      </div>
      <SupplierForm readOnly={!canEdit} values={{ id: s.id, name: s.name, contactName: s.contactName ?? "", email: s.email ?? "", phone: s.phone ?? "", taxId: s.taxId ?? "", address: s.address ?? "", city: s.city ?? "", country: s.country, paymentTermsDays: String(s.paymentTermsDays), notes: s.notes ?? "", isActive: s.isActive }} />
      <Card title="Produits fournis" className="mt-6" padded={false}>
        <div id="produits" />
        <Table minWidth={760}>
          <thead><tr><Th>Référence</Th><Th>Désignation</Th><Th>Réf. fournisseur</Th><Th className="text-right">Prix d&apos;achat HT</Th><Th className="text-right">Délai</Th><Th /></tr></thead>
          <tbody>
            {items.map(({ ps, sku, name }) => (
              <tr key={ps.productId}>
                <Td className="font-mono text-xs">{sku}</Td><Td>{name}{ps.isPreferred && <Badge className="ml-2" tone="bg-accent-soft text-accent-hover">Préféré</Badge>}</Td>
                <Td className="font-mono text-xs">{ps.supplierRef ?? "—"}</Td><Td className="text-right">{formatTND(ps.purchasePrice)}</Td><Td className="text-right">{ps.leadTimeDays ? `${ps.leadTimeDays} j` : "—"}</Td>
                <Td className="text-right">{canEdit && <form action={removeSupplierProductAction}><input type="hidden" name="supplierId" value={s.id} /><input type="hidden" name="productId" value={ps.productId} /><button className="text-xs text-danger">Retirer</button></form>}</Td>
              </tr>
            ))}
            {canEdit && (
              <tr><Td colSpan={6}>
                <form action={setSupplierProductAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="supplierId" value={s.id} />
                  <input name="sku" placeholder="Référence SOGER" required className="h-9 w-44 rounded-md border border-line px-2.5 font-mono text-sm uppercase" />
                  <input name="supplierRef" placeholder="Réf. fournisseur" className="h-9 w-40 rounded-md border border-line px-2.5 text-sm" />
                  <input name="price" placeholder="Prix HT" inputMode="decimal" className="h-9 w-28 rounded-md border border-line px-2.5 text-sm" />
                  <input name="leadTimeDays" placeholder="Délai (j)" type="number" className="h-9 w-24 rounded-md border border-line px-2.5 text-sm" />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isPreferred" /> Préféré</label>
                  <button className="h-9 rounded-md bg-ink px-3 text-xs font-medium text-white">Ajouter / modifier</button>
                </form>
              </Td></tr>
            )}
          </tbody>
        </Table>
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Commandes fournisseurs" padded={false}>
          <Table minWidth={360}><tbody>
            {pos.length === 0 && <tr><Td className="text-steel">Aucune.</Td></tr>}
            {pos.map((p) => <tr key={p.id}><Td><Link href={`/admin/achats/${p.id}`} className="font-mono text-xs font-semibold text-accent">{p.number}</Link></Td><Td><Badge tone={label(PO_STATUS, p.status).tone}>{label(PO_STATUS, p.status).label}</Badge></Td><Td className="text-right tabular-nums">{formatTND(p.total)}</Td></tr>)}
          </tbody></Table>
        </Card>
        <Card title="Factures fournisseur" padded={false}>
          <Table minWidth={360}><tbody>
            {invs.length === 0 && <tr><Td className="text-steel">Aucune.</Td></tr>}
            {invs.map((f) => <tr key={f.id}><Td><Link href={`/admin/factures/${f.id}`} className="font-mono text-xs font-semibold text-accent">{f.externalRef ?? f.number}</Link></Td><Td><Badge tone={label(INVOICE_STATUS, f.status).tone}>{label(INVOICE_STATUS, f.status).label}</Badge></Td><Td className="text-right tabular-nums">{formatTND(f.total)}</Td></tr>)}
          </tbody></Table>
        </Card>
        <Card title="Règlements" padded={false}>
          <Table minWidth={360}><tbody>
            {pays.length === 0 && <tr><Td className="text-steel">Aucun.</Td></tr>}
            {pays.map((p) => <tr key={p.id}><Td className="text-steel">{formatDate(p.paidAt)}</Td><Td>{PAYMENT_METHOD[p.method]}</Td><Td className="text-right tabular-nums">{formatTND(p.amount)}</Td></tr>)}
          </tbody></Table>
        </Card>
      </div>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
