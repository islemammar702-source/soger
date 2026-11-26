import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { goodsReceipts, invoices, purchaseItems, purchaseOrders, suppliers, warehouses } from "@/db/schema";
import { PurchaseOrderEditor } from "@/components/admin/doc-editors";
import { Card, Flash, PageHeader, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS, PO_STATUS, formatDate, formatDateTime, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { addSupplierInvoiceAction, poStatusAction, receiveAction } from "@/server/admin/purchases";
import { requireStaff } from "@/server/auth/dal";

export default async function PurchasePage({ params, searchParams }: PageProps<"/admin/achats/[id]">) {
  const me = await requireStaff("purchases.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [row] = await db.select({ po: purchaseOrders, supplier: suppliers }).from(purchaseOrders).innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(eq(purchaseOrders.id, id));
  if (!row) notFound();
  const { po, supplier } = row;
  const [items, receipts, invs, sups, whs] = await Promise.all([
    db.select().from(purchaseItems).where(eq(purchaseItems.purchaseOrderId, id)).orderBy(asc(purchaseItems.id)),
    db.select().from(goodsReceipts).where(eq(goodsReceipts.purchaseOrderId, id)).orderBy(desc(goodsReceipts.receivedAt)),
    db.select().from(invoices).where(eq(invoices.purchaseOrderId, id)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers),
    db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses),
  ]);
  const editable = ["draft", "sent"].includes(po.status) && me.can("purchases.update");
  const receivable = ["draft", "sent", "partially_received"].includes(po.status) && me.can("purchases.receive");
  return (
    <>
      <PageHeader
        title={`Commande fournisseur ${po.number}`}
        description={<span className="flex items-center gap-2"><Badge tone={label(PO_STATUS, po.status).tone}>{label(PO_STATUS, po.status).label}</Badge><Link href={`/admin/fournisseurs/${supplier.id}`} className="hover:text-accent">{supplier.name}</Link> · {formatDate(po.createdAt)}</span>}
        back={{ href: "/admin/achats", label: "Achats" }}
        actions={
          <>
            <a href={`/documents/achat/${id}`} target="_blank" className={btn.outline}>Bon de commande (PDF)</a>
            {po.status === "draft" && me.can("purchases.update") && <form action={poStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value="sent" /><button className={btn.dark}>Marquer envoyée</button></form>}
            {["draft", "sent"].includes(po.status) && me.can("purchases.cancel") && <form action={poStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value="cancelled" /><button className={btn.danger}>Annuler</button></form>}
          </>
        }
      />
      <Flash sp={sp} />
      {receivable && (
        <Card title="Réception de marchandises" className="mb-6" padded={false}>
          <form action={receiveAction}>
            <input type="hidden" name="id" value={id} />
            <table className="w-full text-sm">
              <thead className="bg-mist/60 text-xs text-steel uppercase"><tr><th className="p-3 text-left">Article</th><th className="p-3 text-right">Commandé</th><th className="p-3 text-right">Déjà reçu</th><th className="p-3 text-right">Reçu maintenant</th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const rest = Number(i.quantityOrdered) - Number(i.quantityReceived);
                  return (
                    <tr key={i.id} className="border-t border-line">
                      <td className="p-3">{i.description}</td>
                      <td className="p-3 text-right tabular-nums">{Number(i.quantityOrdered)}</td>
                      <td className="p-3 text-right tabular-nums text-steel">{Number(i.quantityReceived)}</td>
                      <td className="p-3 text-right">{rest > 0 ? <input name={`q_${i.id}`} defaultValue={rest} inputMode="decimal" aria-label={`Quantité reçue ${i.description}`} className="h-9 w-24 rounded-md border border-line px-2 text-right" /> : "✓"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 border-t border-line p-3 text-sm">
              <input name="deliveryNoteRef" placeholder="N° bon de livraison fournisseur" className="h-9 w-60 rounded-md border border-line px-2" />
              <label className="flex items-center gap-2"><input type="checkbox" name="updateCost" defaultChecked /> Mettre à jour le prix d&apos;achat des produits</label>
              <button className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-white">Valider la réception (entrée en stock)</button>
            </div>
          </form>
        </Card>
      )}
      {editable ? (
        <PurchaseOrderEditor suppliers={sups} warehouses={whs} initial={{ id, supplierId: String(po.supplierId), warehouseId: String(po.warehouseId ?? ""), expectedAt: po.expectedAt ?? "", notes: po.notes ?? "", lines: items.map((i) => ({ productId: i.productId, sku: null, description: i.description, quantity: Number(i.quantityOrdered), unitPrice: Number(i.unitCost), discountRate: 0, vatRate: Number(i.vatRate) })) }} />
      ) : (
        <Card title="Lignes" padded={false}>
          <table className="w-full text-sm"><tbody>{items.map((i) => <tr key={i.id} className="border-b border-line"><td className="p-3">{i.description}</td><td className="p-3 text-right">{Number(i.quantityReceived)} / {Number(i.quantityOrdered)} reçu(s)</td><td className="p-3 text-right">{formatTND(i.unitCost)}</td><td className="p-3 text-right font-semibold">{formatTND(i.lineTotal)}</td></tr>)}</tbody></table>
          <p className="p-4 text-right font-bold">Total TTC {formatTND(po.total)}</p>
        </Card>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Bons de réception">
          {receipts.length === 0 ? <p className="text-sm text-steel">Aucune réception.</p> : <ul className="space-y-1 text-sm">{receipts.map((r) => <li key={r.id} className="flex justify-between"><Link href={`/admin/stock/mouvements?produit=`} className="font-mono">{r.number}</Link><span className="text-steel">{formatDateTime(r.receivedAt)}{r.deliveryNoteRef ? ` · BL ${r.deliveryNoteRef}` : ""}</span></li>)}</ul>}
        </Card>
        <Card title="Facture fournisseur">
          {invs.map((f) => <p key={f.id} className="mb-2 flex justify-between text-sm"><Link href={`/admin/factures/${f.id}`} className="font-mono text-accent">{f.externalRef} ({f.number})</Link><Badge tone={label(INVOICE_STATUS, f.status).tone}>{label(INVOICE_STATUS, f.status).label}</Badge></p>)}
          {me.can("invoices.create") && po.status !== "cancelled" && (
            <form action={addSupplierInvoiceAction} className="grid grid-cols-2 gap-2 text-sm">
              <input type="hidden" name="supplierId" value={supplier.id} /><input type="hidden" name="purchaseOrderId" value={id} /><input type="hidden" name="back" value={`/admin/achats/${id}`} />
              <input name="externalRef" placeholder="N° facture fournisseur" required className="h-9 rounded-md border border-line px-2" />
              <input name="issueDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="h-9 rounded-md border border-line px-2" />
              <input name="subtotal" placeholder="Total HT" defaultValue={Number(po.subtotal).toFixed(3)} inputMode="decimal" className="h-9 rounded-md border border-line px-2" />
              <input name="vatTotal" placeholder="TVA" defaultValue={Number(po.vatTotal).toFixed(3)} inputMode="decimal" className="h-9 rounded-md border border-line px-2" />
              <input name="stampDuty" placeholder="Timbre" defaultValue="1.000" inputMode="decimal" className="h-9 rounded-md border border-line px-2" />
              <input name="dueDate" type="date" className="h-9 rounded-md border border-line px-2" aria-label="Échéance" />
              <button className="col-span-2 h-9 rounded-md bg-ink text-xs font-medium text-white">Enregistrer la facture fournisseur</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
