import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, stock, warehouses } from "@/db/schema";
import { Card, EmptyRow, FilterBar, FilterSelect, PageHeader, Pagination, StatCard, Table, Td, Th, btn, listHref, one } from "@/components/admin/ui";
import { formatNumber, formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;

export default async function StockPage({ searchParams }: PageProps<"/admin/stock">) {
  const me = await requireStaff("stock.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const q = one(sp.q).trim();
  const wid = Number(one(sp.depot)) || null;
  const alert = one(sp.alerte);
  const stockJoin = wid ? and(eq(stock.productId, products.id), eq(stock.warehouseId, wid)) : eq(stock.productId, products.id);
  const onHand = sql<string>`coalesce(sum(${stock.quantityOnHand}), 0)`;
  const reserved = sql<string>`coalesce(sum(${stock.quantityReserved}), 0)`;
  const conds: (SQL | undefined)[] = [eq(products.isActive, true), sql`${products.status} <> 'archived'`];
  if (q) conds.push(or(ilike(products.sku, `%${q}%`), ilike(products.name, `%${q}%`), eq(products.barcode, q)));
  const having = alert === "1" ? sql`coalesce(sum(${stock.quantityOnHand} - ${stock.quantityReserved}), 0) <= ${products.minStock}` : alert === "0" ? sql`coalesce(sum(${stock.quantityOnHand} - ${stock.quantityReserved}), 0) <= 0` : undefined;

  const base = db
    .select({ id: products.id, sku: products.sku, name: products.name, unit: products.unit, minStock: products.minStock, cost: products.purchasePrice, category: categories.name, onHand, reserved })
    .from(products)
    .leftJoin(stock, stockJoin)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conds))
    .groupBy(products.id, categories.name)
    .$dynamic();
  const filtered = having ? base.having(having) : base;
  const [rows, [{ total }], whs, [valuation]] = await Promise.all([
    filtered.orderBy(asc(products.name)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(filtered.as("f")),
    db.select().from(warehouses).where(eq(warehouses.isActive, true)).orderBy(warehouses.name),
    db
      .select({ value: sql<string>`coalesce(sum(${stock.quantityOnHand} * coalesce(${products.purchasePrice}, 0)), 0)`, units: sql<string>`coalesce(sum(${stock.quantityOnHand}), 0)` })
      .from(stock)
      .innerJoin(products, eq(products.id, stock.productId))
      .where(wid ? eq(stock.warehouseId, wid) : undefined),
  ]);
  const canCost = me.can("products.view_cost");
  return (
    <>
      <PageHeader
        title="Niveaux de stock"
        description="Physique = présent en dépôt · Réservé = commandes confirmées non livrées · Disponible = physique − réservé"
        actions={
          <>
            {me.can("stock.adjust") && <Link href="/admin/stock/operations" className={btn.primary}>Nouveau mouvement</Link>}
            {me.can("settings.update") && <Link href="/admin/stock/depots" className={btn.outline}>Dépôts</Link>}
          </>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Articles en stock (unités)" value={formatNumber(Number(valuation.units))} />
        {canCost && <StatCard label="Valeur du stock (prix d'achat HT)" value={formatTND(valuation.value)} />}
        <StatCard label="Références affichées" value={String(total)} />
      </div>
      <FilterBar action="/admin/stock" q={q} placeholder="Référence, désignation, code-barres…">
        <FilterSelect name="depot" label="Tous les dépôts" value={one(sp.depot)} options={whs.map((w) => [String(w.id), w.name])} />
        <FilterSelect name="alerte" label="Tous les niveaux" value={alert} options={[["1", "Sous le minimum"], ["0", "En rupture"]]} />
      </FilterBar>
      <Card padded={false}>
        <Table minWidth={860}>
          <thead><tr><Th>Référence</Th><Th>Désignation</Th><Th>Catégorie</Th><Th className="text-right">Physique</Th><Th className="text-right">Réservé</Th><Th className="text-right">Disponible</Th><Th className="text-right">Minimum</Th>{canCost && <Th className="text-right">Valeur</Th>}</tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8} />}
            {rows.map((r) => {
              const avail = Number(r.onHand) - Number(r.reserved);
              return (
                <tr key={r.id} className="hover:bg-mist/40">
                  <Td><Link href={`/admin/stock/mouvements?produit=${encodeURIComponent(r.sku)}`} className="font-mono text-xs font-semibold text-accent">{r.sku}</Link></Td>
                  <Td className="max-w-xs"><Link href={`/admin/produits/${r.id}`} className="line-clamp-1 hover:text-accent">{r.name}</Link></Td>
                  <Td className="text-steel">{r.category ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{Number(r.onHand)}</Td>
                  <Td className="text-right tabular-nums text-steel">{Number(r.reserved)}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${avail <= 0 ? "text-danger" : avail <= Number(r.minStock) ? "text-amber-700" : ""}`}>{avail}</Td>
                  <Td className="text-right tabular-nums text-steel">{Number(r.minStock)}</Td>
                  {canCost && <Td className="text-right tabular-nums">{formatTND(Number(r.onHand) * Number(r.cost ?? 0))}</Td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} href={(n) => listHref("/admin/stock", sp, { page: n })} />
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
