import Link from "next/link";
import { and, desc, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { Card, EmptyRow, FilterBar, FilterSelect, PageHeader, Pagination, StatCard, Table, Td, Th, listHref, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;
const KIND: Record<string, string> = { customer: "Client", supplier: "Fournisseur", credit_note: "Avoir" };

export default async function InvoicesPage({ searchParams }: PageProps<"/admin/factures">) {
  await requireStaff("invoices.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const q = one(sp.q).trim();
  const conds: (SQL | undefined)[] = [];
  if (q) conds.push(or(ilike(invoices.number, `%${q}%`), ilike(invoices.billingName, `%${q}%`), ilike(invoices.externalRef, `%${q}%`)));
  if (one(sp.type)) conds.push(sql`${invoices.kind} = ${one(sp.type)}`);
  if (one(sp.statut) === "impayees") conds.push(sql`${invoices.status} in ('issued','partially_paid')`);
  else if (one(sp.statut)) conds.push(sql`${invoices.status} = ${one(sp.statut)}`);
  if (one(sp.statut) === "echues") conds.push(sql`${invoices.status} in ('issued','partially_paid') and ${invoices.dueDate} < current_date`);
  const where = and(...conds);
  const [rows, [{ total }], [sum]] = await Promise.all([
    db.select().from(invoices).where(where).orderBy(desc(invoices.issueDate), desc(invoices.id)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(invoices).where(where),
    db.select({
      receivable: sql<string>`coalesce(sum(total - amount_paid) filter (where kind = 'customer' and status in ('issued','partially_paid')), 0)`,
      overdue: sql<string>`coalesce(sum(total - amount_paid) filter (where kind = 'customer' and status in ('issued','partially_paid') and due_date < current_date), 0)`,
      payable: sql<string>`coalesce(sum(total - amount_paid) filter (where kind = 'supplier' and status in ('issued','partially_paid')), 0)`,
    }).from(invoices),
  ]);
  return (
    <>
      <PageHeader title="Factures" description="Factures clients, avoirs et factures fournisseurs." />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Créances clients" value={formatTND(sum.receivable)} href="/admin/factures?type=customer&statut=impayees" />
        <StatCard label="dont échues" value={formatTND(sum.overdue)} tone={Number(sum.overdue) > 0 ? "danger" : "default"} href="/admin/factures?type=customer&statut=echues" />
        <StatCard label="Dettes fournisseurs" value={formatTND(sum.payable)} href="/admin/factures?type=supplier&statut=impayees" />
      </div>
      <FilterBar action="/admin/factures" q={q} placeholder="N°, client, fournisseur, réf. externe…">
        <FilterSelect name="type" label="Tous les types" value={one(sp.type)} options={Object.entries(KIND)} />
        <FilterSelect name="statut" label="Tous les statuts" value={one(sp.statut)} options={[["impayees", "Non soldées"], ["echues", "Échues"], ...Object.entries(INVOICE_STATUS).map(([k, v]) => [k, v.label] as [string, string])]} />
      </FilterBar>
      <Card padded={false}>
        <Table minWidth={900}>
          <thead><tr><Th>N°</Th><Th>Type</Th><Th>Date</Th><Th>Échéance</Th><Th>Tiers</Th><Th>Statut</Th><Th className="text-right">Total TTC</Th><Th className="text-right">Reste dû</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8} />}
            {rows.map((f) => {
              const rest = Number(f.total) - Number(f.amountPaid);
              const overdue = ["issued", "partially_paid"].includes(f.status) && f.dueDate && new Date(f.dueDate) < new Date(new Date().toDateString());
              return (
                <tr key={f.id} className="hover:bg-mist/40">
                  <Td><Link href={`/admin/factures/${f.id}`} className="font-mono text-xs font-semibold text-accent">{f.number}</Link>{f.externalRef && <p className="font-mono text-xs text-steel">{f.externalRef}</p>}</Td>
                  <Td className="text-xs">{KIND[f.kind]}</Td>
                  <Td className="text-steel">{formatDate(f.issueDate)}</Td>
                  <Td className={overdue ? "font-medium text-danger" : "text-steel"}>{formatDate(f.dueDate)}</Td>
                  <Td>{f.billingName}</Td>
                  <Td><Badge tone={label(INVOICE_STATUS, f.status).tone}>{label(INVOICE_STATUS, f.status).label}</Badge></Td>
                  <Td className="text-right tabular-nums">{formatTND(f.total)}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${rest > 0.0005 && f.status !== "cancelled" ? "text-amber-700" : "text-steel"}`}>{f.status === "cancelled" ? "—" : formatTND(rest)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} href={(n) => listHref("/admin/factures", sp, { page: n })} />
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
