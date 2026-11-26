import Link from "next/link";
import { Plus } from "lucide-react";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchaseOrders, suppliers } from "@/db/schema";
import { Card, EmptyRow, FilterSelect, PageHeader, Table, Td, Th, btn, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { PO_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

export default async function PurchasesPage({ searchParams }: PageProps<"/admin/achats">) {
  const me = await requireStaff("purchases.view");
  const sp = await searchParams;
  const rows = await db
    .select({ po: purchaseOrders, supplier: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(one(sp.statut) ? sql`${purchaseOrders.status} = ${one(sp.statut)}` : undefined)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(200);
  return (
    <>
      <PageHeader title="Commandes fournisseurs" actions={me.can("purchases.create") && <Link href="/admin/achats/nouveau" className={btn.primary}><Plus className="size-4" /> Nouvelle commande</Link>} />
      <form action="/admin/achats" className="mb-4 flex gap-2"><FilterSelect name="statut" label="Tous les statuts" value={one(sp.statut)} options={Object.entries(PO_STATUS).map(([k, v]) => [k, v.label])} /><button className="h-10 rounded-lg bg-ink px-4 text-sm text-white">Filtrer</button></form>
      <Card padded={false}>
        <Table>
          <thead><tr><Th>N°</Th><Th>Date</Th><Th>Fournisseur</Th><Th>Livraison prévue</Th><Th>Statut</Th><Th className="text-right">Total TTC</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>Aucune commande fournisseur.</EmptyRow>}
            {rows.map(({ po, supplier }) => (
              <tr key={po.id} className="hover:bg-mist/40">
                <Td><Link href={`/admin/achats/${po.id}`} className="font-mono text-xs font-semibold text-accent">{po.number}</Link></Td>
                <Td className="text-steel">{formatDate(po.createdAt)}</Td>
                <Td>{supplier}</Td>
                <Td className="text-steel">{formatDate(po.expectedAt)}</Td>
                <Td><Badge tone={label(PO_STATUS, po.status).tone}>{label(PO_STATUS, po.status).label}</Badge></Td>
                <Td className="text-right font-semibold tabular-nums">{formatTND(po.total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
