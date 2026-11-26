import Link from "next/link";
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements, users, warehouses } from "@/db/schema";
import { Card, EmptyRow, FilterSelect, PageHeader, Pagination, Table, Td, Th, listHref, one } from "@/components/admin/ui";
import { MOVEMENT_TYPE, formatDateTime } from "@/lib/labels";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;

export default async function MovementsPage({ searchParams }: PageProps<"/admin/stock/mouvements">) {
  await requireStaff("stock.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const sku = one(sp.produit).trim().toUpperCase();
  const conds: (SQL | undefined)[] = [];
  if (sku) conds.push(eq(products.sku, sku));
  if (one(sp.type)) conds.push(sql`${stockMovements.type} = ${one(sp.type)}`);
  if (Number(one(sp.depot))) conds.push(eq(stockMovements.warehouseId, Number(one(sp.depot))));
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(sp.du))) conds.push(gte(stockMovements.createdAt, new Date(one(sp.du))));
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(sp.au))) conds.push(lt(stockMovements.createdAt, new Date(new Date(one(sp.au)).getTime() + 86_400_000)));
  const where = and(...conds);
  const [rows, [{ total }], whs] = await Promise.all([
    db
      .select({ m: stockMovements, sku: products.sku, name: products.name, productId: products.id, warehouse: warehouses.name, user: users.name })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .where(where)
      .orderBy(desc(stockMovements.id))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(stockMovements).innerJoin(products, eq(products.id, stockMovements.productId)).where(where),
    db.select().from(warehouses).orderBy(warehouses.name),
  ]);
  const refLink = (t: string | null, id: number | null) =>
    t === "order" ? `/admin/commandes/${id}` : t === "goods_receipt" ? `/admin/achats?reception=${id}` : t === "stock_count" ? `/admin/stock/inventaires/${id}` : null;
  return (
    <>
      <PageHeader title="Mouvements de stock" description="Historique complet et non modifiable : chaque variation de quantité y figure." />
      <form action="/admin/stock/mouvements" className="mb-4 flex flex-wrap items-center gap-2">
        <input name="produit" defaultValue={sku} placeholder="Référence produit" className="h-10 w-48 rounded-lg border border-line bg-white px-3 font-mono text-sm uppercase outline-none focus:border-accent" />
        <FilterSelect name="type" label="Tous les types" value={one(sp.type)} options={Object.entries(MOVEMENT_TYPE)} />
        <FilterSelect name="depot" label="Tous les dépôts" value={one(sp.depot)} options={whs.map((w) => [String(w.id), w.name])} />
        <input type="date" name="du" defaultValue={one(sp.du)} aria-label="Du" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <input type="date" name="au" defaultValue={one(sp.au)} aria-label="Au" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <button className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-white">Filtrer</button>
      </form>
      <Card padded={false}>
        <Table minWidth={980}>
          <thead><tr><Th>Date</Th><Th>Produit</Th><Th>Type</Th><Th>Dépôt</Th><Th className="text-right">Quantité</Th><Th className="text-right">Stock après</Th><Th>Origine / motif</Th><Th>Par</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8} />}
            {rows.map(({ m, sku: s, name, productId, warehouse, user }) => {
              const link = refLink(m.referenceType, m.referenceId);
              return (
                <tr key={m.id} className="hover:bg-mist/40">
                  <Td className="whitespace-nowrap text-steel">{formatDateTime(m.createdAt)}</Td>
                  <Td><Link href={`/admin/produits/${productId}`} className="font-mono text-xs font-semibold text-accent">{s}</Link><p className="line-clamp-1 max-w-56 text-xs text-steel">{name}</p></Td>
                  <Td>{MOVEMENT_TYPE[m.type]}</Td>
                  <Td className="text-steel">{warehouse}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${Number(m.quantity) < 0 ? "text-danger" : "text-accent-hover"}`}>{Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity)}</Td>
                  <Td className="text-right tabular-nums">{Number(m.quantityAfter)}</Td>
                  <Td className="max-w-64 text-xs">{link ? <Link href={link} className="text-accent hover:underline">{m.note ?? m.referenceType}</Link> : (m.note ?? "—")}</Td>
                  <Td className="text-xs text-steel">{user ?? "Système"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} href={(n) => listHref("/admin/stock/mouvements", sp, { page: n })} />
      </Card>
    </>
  );
}
