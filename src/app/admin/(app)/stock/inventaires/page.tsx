import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, stockCountItems, stockCounts, users, warehouses } from "@/db/schema";
import { Card, EmptyRow, Flash, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { openStockCountAction } from "@/server/admin/stock";
import { requireStaff } from "@/server/auth/dal";

const STATUS: Record<string, [string, string]> = { open: ["En cours", "bg-amber-50 text-amber-700"], closed: ["Clôturé", "bg-accent-soft text-accent-hover"], cancelled: ["Annulé", "bg-steel/10 text-graphite"] };

export default async function CountsPage({ searchParams }: PageProps<"/admin/stock/inventaires">) {
  await requireStaff("stock.inventory");
  const sp = await searchParams;
  const [rows, whs, cats] = await Promise.all([
    db
      .select({ c: stockCounts, warehouse: warehouses.name, user: users.name, lines: sql<number>`(select count(*)::int from ${stockCountItems} i where i.count_id = ${stockCounts.id})`, counted: sql<number>`(select count(*)::int from ${stockCountItems} i where i.count_id = ${stockCounts.id} and i.counted is not null)` })
      .from(stockCounts)
      .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
      .leftJoin(users, eq(users.id, stockCounts.createdBy))
      .orderBy(desc(stockCounts.id))
      .limit(50),
    db.select().from(warehouses).where(eq(warehouses.isActive, true)),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(categories.name),
  ]);
  return (
    <>
      <PageHeader title="Inventaires" description="Ouvrez un inventaire, saisissez les quantités comptées, puis clôturez : les écarts deviennent des mouvements « inventaire » tracés." />
      <Flash sp={sp} />
      <Card title="Nouvel inventaire" className="mb-6">
        <form action={openStockCountAction} className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="mb-1 block font-medium">Dépôt</span><select name="warehouseId" className="h-10 rounded-lg border border-line px-3">{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Catégorie (inventaire tournant)</span><select name="categoryId" className="h-10 rounded-lg border border-line px-3"><option value="">Toutes</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="min-w-64 flex-1 text-sm"><span className="mb-1 block font-medium">Note</span><input name="note" placeholder="ex. inventaire annuel 2026" className="h-10 w-full rounded-lg border border-line px-3" /></label>
          <SubmitButton variant="dark">Ouvrir l&apos;inventaire</SubmitButton>
        </form>
      </Card>
      <Card padded={false}>
        <Table>
          <thead><tr><Th>N°</Th><Th>Dépôt</Th><Th>Ouvert le</Th><Th>Par</Th><Th>Avancement</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>Aucun inventaire.</EmptyRow>}
            {rows.map(({ c, warehouse, user, lines, counted }) => (
              <tr key={c.id} className="hover:bg-mist/40">
                <Td><Link href={`/admin/stock/inventaires/${c.id}`} className="font-semibold text-accent">#{c.id}</Link> {c.note && <span className="text-xs text-steel">{c.note}</span>}</Td>
                <Td>{warehouse}</Td>
                <Td className="text-steel">{formatDateTime(c.createdAt)}</Td>
                <Td className="text-steel">{user}</Td>
                <Td className="tabular-nums">{counted} / {lines}</Td>
                <Td><Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
