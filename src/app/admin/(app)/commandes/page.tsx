import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { Card, EmptyRow, FilterBar, FilterSelect, PageHeader, Pagination, Table, Td, Th, listHref, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { CHANNEL, ORDER_STATUS, PAYMENT_STATUS, formatDateTime, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;

export default async function OrdersPage({ searchParams }: PageProps<"/admin/commandes">) {
  await requireStaff("orders.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const q = one(sp.q).trim();
  const conds: (SQL | undefined)[] = [];
  if (q) conds.push(or(ilike(orders.number, `%${q}%`), ilike(orders.shippingName, `%${q}%`), ilike(customers.companyName, `%${q}%`), ilike(customers.lastName, `%${q}%`), ilike(customers.phone, `%${q}%`)));
  if (one(sp.statut)) conds.push(sql`${orders.status} = ${one(sp.statut)}`);
  if (one(sp.canal)) conds.push(sql`${orders.channel} = ${one(sp.canal)}`);
  if (one(sp.paiement)) conds.push(sql`${orders.paymentStatus} = ${one(sp.paiement)}`);
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ o: orders, company: customers.companyName, first: customers.firstName, last: customers.lastName }).from(orders).leftJoin(customers, eq(customers.id, orders.customerId)).where(where).orderBy(desc(orders.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(orders).leftJoin(customers, eq(customers.id, orders.customerId)).where(where),
  ]);
  return (
    <>
      <PageHeader title="Commandes et ventes" description={`${total} commande(s)`} />
      <FilterBar action="/admin/commandes" q={q} placeholder="N°, client, téléphone…">
        <FilterSelect name="statut" label="Tous les statuts" value={one(sp.statut)} options={Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])} />
        <FilterSelect name="canal" label="Tous les canaux" value={one(sp.canal)} options={Object.entries(CHANNEL)} />
        <FilterSelect name="paiement" label="Tous paiements" value={one(sp.paiement)} options={Object.entries(PAYMENT_STATUS).map(([k, v]) => [k, v.label])} />
      </FilterBar>
      <Card padded={false}>
        <Table minWidth={940}>
          <thead><tr><Th>N°</Th><Th>Date</Th><Th>Client</Th><Th>Canal</Th><Th>Statut</Th><Th>Paiement</Th><Th className="text-right">Total TTC</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7} />}
            {rows.map(({ o, company, first, last }) => (
              <tr key={o.id} className="hover:bg-mist/40">
                <Td><Link href={`/admin/commandes/${o.id}`} className="font-mono text-xs font-semibold text-accent">{o.number}</Link></Td>
                <Td className="whitespace-nowrap text-steel">{formatDateTime(o.createdAt)}</Td>
                <Td>{company || [first, last].filter(Boolean).join(" ") || o.shippingName || <span className="text-steel">Client comptoir</span>}</Td>
                <Td className="text-xs">{CHANNEL[o.channel]}</Td>
                <Td><Badge tone={label(ORDER_STATUS, o.status).tone}>{label(ORDER_STATUS, o.status).label}</Badge></Td>
                <Td><Badge tone={label(PAYMENT_STATUS, o.paymentStatus).tone}>{label(PAYMENT_STATUS, o.paymentStatus).label}</Badge></Td>
                <Td className="text-right font-semibold tabular-nums">{formatTND(o.total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} href={(n) => listHref("/admin/commandes", sp, { page: n })} />
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
