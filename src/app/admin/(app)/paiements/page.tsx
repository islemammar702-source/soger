import Link from "next/link";
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, orders, payments, suppliers, users } from "@/db/schema";
import { Card, EmptyRow, FilterSelect, PageHeader, Pagination, StatCard, Table, Td, Th, listHref, one } from "@/components/admin/ui";
import { PAYMENT_METHOD, formatDateTime } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/paiements">) {
  await requireStaff("payments.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const conds: (SQL | undefined)[] = [];
  if (one(sp.sens)) conds.push(sql`${payments.direction} = ${one(sp.sens)}`);
  if (one(sp.mode)) conds.push(sql`${payments.method} = ${one(sp.mode)}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(sp.du))) conds.push(gte(payments.paidAt, new Date(one(sp.du))));
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(sp.au))) conds.push(lt(payments.paidAt, new Date(new Date(one(sp.au)).getTime() + 86_400_000)));
  const where = and(...conds);
  const [rows, [agg]] = await Promise.all([
    db
      .select({ p: payments, cust: customers.companyName, first: customers.firstName, last: customers.lastName, sup: suppliers.name, inv: invoices.number, ord: orders.number, user: users.name })
      .from(payments)
      .leftJoin(customers, eq(customers.id, payments.customerId))
      .leftJoin(suppliers, eq(suppliers.id, payments.supplierId))
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(users, eq(users.id, payments.recordedBy))
      .where(where)
      .orderBy(desc(payments.paidAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ n: sql<number>`count(*)::int`, cin: sql<string>`coalesce(sum(amount) filter (where direction = 'in'), 0)`, cout: sql<string>`coalesce(sum(amount) filter (where direction = 'out'), 0)` }).from(payments).where(where),
  ]);
  return (
    <>
      <PageHeader title="Paiements" description="Encaissements clients, règlements fournisseurs et remboursements." />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Encaissements" value={formatTND(agg.cin)} tone="success" />
        <StatCard label="Décaissements" value={formatTND(agg.cout)} />
        <StatCard label="Solde de la période" value={formatTND(Number(agg.cin) - Number(agg.cout))} />
      </div>
      <form action="/admin/paiements" className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect name="sens" label="Entrées et sorties" value={one(sp.sens)} options={[["in", "Encaissements"], ["out", "Décaissements"]]} />
        <FilterSelect name="mode" label="Tous les modes" value={one(sp.mode)} options={Object.entries(PAYMENT_METHOD)} />
        <input type="date" name="du" defaultValue={one(sp.du)} aria-label="Du" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <input type="date" name="au" defaultValue={one(sp.au)} aria-label="Au" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <button className="h-10 rounded-lg bg-ink px-4 text-sm text-white">Filtrer</button>
      </form>
      <Card padded={false}>
        <Table minWidth={900}>
          <thead><tr><Th>Date</Th><Th>Tiers</Th><Th>Mode</Th><Th>Pièce</Th><Th>Saisi par</Th><Th className="text-right">Montant</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6} />}
            {rows.map(({ p, cust, first, last, sup, inv, ord, user }) => (
              <tr key={p.id} className="hover:bg-mist/40">
                <Td className="whitespace-nowrap text-steel">{formatDateTime(p.paidAt)}</Td>
                <Td>{sup ?? cust ?? ([first, last].filter(Boolean).join(" ") || <span className="text-steel">Comptoir</span>)}</Td>
                <Td>{PAYMENT_METHOD[p.method]}{p.reference && <p className="font-mono text-xs text-steel">{p.reference}</p>}</Td>
                <Td className="font-mono text-xs">{p.invoiceId ? <Link href={`/admin/factures/${p.invoiceId}`} className="text-accent">{inv}</Link> : p.orderId ? <Link href={`/admin/commandes/${p.orderId}`} className="text-accent">{ord}</Link> : "—"}</Td>
                <Td className="text-xs text-steel">{user}</Td>
                <Td className={`text-right font-semibold tabular-nums ${p.direction === "out" ? "text-danger" : "text-accent-hover"}`}>{p.direction === "out" ? "−" : "+"}{formatTND(p.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(agg.n / PAGE)} href={(n) => listHref("/admin/paiements", sp, { page: n })} />
      </Card>
    </>
  );
}
