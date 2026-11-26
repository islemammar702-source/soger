import { notFound } from "next/navigation";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockCountItems, stockCounts, warehouses } from "@/db/schema";
import { Card, Flash, PageHeader, Table, Td, Th, one } from "@/components/admin/ui";
import { SubmitButton } from "@/components/ui/form";
import { cancelCountAction, saveCountAction } from "@/server/admin/stock";
import { requireStaff } from "@/server/auth/dal";

export default async function CountPage({ params, searchParams }: PageProps<"/admin/stock/inventaires/[id]">) {
  await requireStaff("stock.inventory");
  const id = Number((await params).id);
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const [c] = await db.select({ c: stockCounts, warehouse: warehouses.name }).from(stockCounts).innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId)).where(eq(stockCounts.id, id));
  if (!c) notFound();
  const lines = await db
    .select({ productId: stockCountItems.productId, expected: stockCountItems.expected, counted: stockCountItems.counted, sku: products.sku, name: products.name, unit: products.unit })
    .from(stockCountItems)
    .innerJoin(products, eq(products.id, stockCountItems.productId))
    .where(and(eq(stockCountItems.countId, id), q ? or(ilike(products.sku, `%${q}%`), ilike(products.name, `%${q}%`), eq(products.barcode, q)) : undefined))
    .orderBy(asc(products.sku))
    .limit(300);
  const [stats] = await db
    .select({ total: sql<number>`count(*)::int`, done: sql<number>`count(counted)::int`, gaps: sql<number>`count(*) filter (where counted is not null and counted <> expected)::int` })
    .from(stockCountItems)
    .where(eq(stockCountItems.countId, id));
  const open = c.c.status === "open";
  return (
    <>
      <PageHeader
        title={`Inventaire #${id} — ${c.warehouse}`}
        description={`${stats.done} / ${stats.total} référence(s) comptée(s) · ${stats.gaps} écart(s)${c.c.note ? ` · ${c.c.note}` : ""}`}
        back={{ href: "/admin/stock/inventaires", label: "Inventaires" }}
        actions={open && <form action={cancelCountAction}><input type="hidden" name="countId" value={id} /><button className="h-10 rounded-lg border border-red-200 px-4 text-sm text-danger hover:bg-red-50">Annuler l&apos;inventaire</button></form>}
      />
      <Flash sp={sp} />
      <form action={`/admin/stock/inventaires/${id}`} className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Filtrer : référence, désignation, code-barres" className="h-10 flex-1 rounded-lg border border-line bg-white px-3 text-sm" />
        <button className="h-10 rounded-lg bg-ink px-4 text-sm text-white">Filtrer</button>
      </form>
      <form action={saveCountAction}>
        <input type="hidden" name="countId" value={id} />
        <input type="hidden" name="filters" value={q ? `q=${q}` : ""} />
        <Card padded={false}>
          <Table minWidth={720}>
            <thead><tr><Th>Référence</Th><Th>Désignation</Th><Th className="text-right">Théorique</Th><Th className="text-right">Compté</Th><Th className="text-right">Écart</Th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const gap = l.counted == null ? null : Number(l.counted) - Number(l.expected);
                return (
                  <tr key={l.productId}>
                    <Td className="font-mono text-xs">{l.sku}</Td>
                    <Td className="max-w-sm"><span className="line-clamp-1">{l.name}</span></Td>
                    <Td className="text-right tabular-nums text-steel">{Number(l.expected)}</Td>
                    <Td className="text-right">
                      {open ? <input name={`c_${l.productId}`} defaultValue={l.counted == null ? "" : Number(l.counted)} inputMode="decimal" aria-label={`Quantité comptée ${l.sku}`} className="h-9 w-24 rounded-md border border-line px-2 text-right tabular-nums focus:border-accent focus:outline-none" /> : <span className="tabular-nums">{l.counted == null ? "—" : Number(l.counted)}</span>}
                    </Td>
                    <Td className={`text-right font-semibold tabular-nums ${gap ? (gap < 0 ? "text-danger" : "text-accent-hover") : "text-steel"}`}>{gap == null ? "" : gap > 0 ? `+${gap}` : gap}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        {lines.length === 300 && <p className="mt-2 text-xs text-steel">300 premières lignes affichées : utilisez le filtre pour les autres.</p>}
        {open && (
          <div className="mt-4 flex flex-wrap gap-3">
            <SubmitButton variant="dark">Enregistrer le comptage</SubmitButton>
            <button name="close" value="1" className="h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover">Enregistrer et clôturer (appliquer les écarts)</button>
          </div>
        )}
      </form>
    </>
  );
}
