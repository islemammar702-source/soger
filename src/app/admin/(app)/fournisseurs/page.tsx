import Link from "next/link";
import { Plus } from "lucide-react";
import { and, asc, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { invoices, productSuppliers, suppliers } from "@/db/schema";
import { Card, EmptyRow, FilterBar, PageHeader, Table, Td, Th, btn, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

export default async function SuppliersPage({ searchParams }: PageProps<"/admin/fournisseurs">) {
  const me = await requireStaff("suppliers.view");
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const conds: (SQL | undefined)[] = [];
  if (q) conds.push(or(ilike(suppliers.name, `%${q}%`), ilike(suppliers.code, `%${q}%`), ilike(suppliers.contactName, `%${q}%`), ilike(suppliers.phone, `%${q}%`)));
  const rows = await db
    .select({
      s: suppliers,
      products: sql<number>`(select count(*)::int from ${productSuppliers} ps where ps.supplier_id = ${suppliers.id})`,
      debt: sql<string>`coalesce((select sum(i.total - i.amount_paid) from ${invoices} i where i.supplier_id = ${suppliers.id} and i.kind = 'supplier' and i.status in ('issued','partially_paid')), 0)`,
    })
    .from(suppliers)
    .where(and(...conds))
    .orderBy(asc(suppliers.name))
    .limit(200);
  return (
    <>
      <PageHeader title="Fournisseurs" actions={me.can("suppliers.create") && <Link href="/admin/fournisseurs/nouveau" className={btn.primary}><Plus className="size-4" /> Nouveau fournisseur</Link>} />
      <FilterBar action="/admin/fournisseurs" q={q} placeholder="Nom, code, contact, téléphone…" />
      <Card padded={false}>
        <Table>
          <thead><tr><Th>Code</Th><Th>Fournisseur</Th><Th>Contact</Th><Th className="text-right">Produits</Th><Th className="text-right">Dette</Th><Th /></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>Aucun fournisseur.</EmptyRow>}
            {rows.map(({ s, products, debt }) => (
              <tr key={s.id} className="hover:bg-mist/40">
                <Td><Link href={`/admin/fournisseurs/${s.id}`} className="font-mono text-xs font-semibold text-accent">{s.code}</Link></Td>
                <Td><Link href={`/admin/fournisseurs/${s.id}`} className="font-medium hover:text-accent">{s.name}</Link><p className="text-xs text-steel">{s.city}{s.country !== "Tunisie" ? ` · ${s.country}` : ""}</p></Td>
                <Td className="text-xs text-steel">{s.contactName}<br />{s.phone}</Td>
                <Td className="text-right tabular-nums">{products}</Td>
                <Td className={`text-right font-semibold tabular-nums ${Number(debt) > 0 ? "text-amber-700" : "text-steel"}`}>{formatTND(debt)}</Td>
                <Td>{!s.isActive && <Badge tone="bg-red-50 text-red-700">Inactif</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
