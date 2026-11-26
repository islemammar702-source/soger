import Link from "next/link";
import { Plus } from "lucide-react";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { customerDueFor } from "@/server/receivables";
import { Card, EmptyRow, FilterBar, FilterSelect, PageHeader, Pagination, Table, Td, Th, btn, listHref, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;
/** Factures non soldées + ventes à crédit non facturées. */
const receivableExpr = customerDueFor(sql`${customers.id}`);

export default async function CustomersPage({ searchParams }: PageProps<"/admin/clients">) {
  const me = await requireStaff("customers.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const q = one(sp.q).trim();
  const conds: (SQL | undefined)[] = [];
  if (q) {
    const like = `%${q}%`;
    conds.push(or(ilike(customers.code, like), ilike(customers.companyName, like), ilike(customers.lastName, like), ilike(customers.firstName, like), ilike(customers.phone, like), ilike(customers.email, like), ilike(customers.taxId, like)));
  }
  if (one(sp.type)) conds.push(sql`${customers.type} = ${one(sp.type)}`);
  if (one(sp.filtre) === "pro_attente") conds.push(and(eq(customers.type, "professional"), eq(customers.priceTier, "retail")));
  if (one(sp.filtre) === "solde") conds.push(sql`${receivableExpr} > 0`);
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ c: customers, balance: receivableExpr, orders: sql<number>`(select count(*)::int from ${orders} o where o.customer_id = ${customers.id})` })
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  return (
    <>
      <PageHeader title="Clients" description={`${total} client(s)`} actions={me.can("customers.create") && <Link href="/admin/clients/nouveau" className={btn.primary}><Plus className="size-4" /> Nouveau client</Link>} />
      <FilterBar action="/admin/clients" q={q} placeholder="Nom, société, code, téléphone, e-mail, matricule…">
        <FilterSelect name="type" label="Tous les types" value={one(sp.type)} options={[["individual", "Particuliers"], ["professional", "Professionnels"]]} />
        <FilterSelect name="filtre" label="Tous" value={one(sp.filtre)} options={[["pro_attente", "Pros à valider"], ["solde", "Avec solde dû"]]} />
      </FilterBar>
      <Card padded={false}>
        <Table minWidth={900}>
          <thead><tr><Th>Code</Th><Th>Client</Th><Th>Contact</Th><Th>Type</Th><Th className="text-right">Commandes</Th>{me.can("customers.view_balance") && <Th className="text-right">Solde dû</Th>}</tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6} />}
            {rows.map(({ c, balance, orders: n }) => (
              <tr key={c.id} className="hover:bg-mist/40">
                <Td><Link href={`/admin/clients/${c.id}`} className="font-mono text-xs font-semibold text-accent">{c.code}</Link></Td>
                <Td><Link href={`/admin/clients/${c.id}`} className="font-medium hover:text-accent">{c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ")}</Link>{c.companyName && <p className="text-xs text-steel">{[c.firstName, c.lastName].filter(Boolean).join(" ")}</p>}</Td>
                <Td className="text-xs text-steel">{c.phone}<br />{c.email}</Td>
                <Td>
                  {c.type === "professional" ? (c.priceTier === "professional" ? <Badge tone="bg-accent-soft text-accent-hover">Pro validé</Badge> : <Badge tone="bg-amber-50 text-amber-700">Pro à valider</Badge>) : <Badge>Particulier</Badge>}
                  {c.userId && <Badge className="ml-1" tone="bg-sky-50 text-sky-700">Compte web</Badge>}
                </Td>
                <Td className="text-right tabular-nums">{n}</Td>
                {me.can("customers.view_balance") && <Td className={`text-right font-semibold tabular-nums ${Number(balance) > 0 ? "text-amber-700" : "text-steel"}`}>{formatTND(balance)}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} href={(n) => listHref("/admin/clients", sp, { page: n })} />
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
