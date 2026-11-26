import Link from "next/link";
import { Plus } from "lucide-react";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, quotes } from "@/db/schema";
import { Card, EmptyRow, FilterBar, FilterSelect, PageHeader, Pagination, Table, Td, Th, btn, listHref, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;

export default async function QuotesPage({ searchParams }: PageProps<"/admin/devis">) {
  const me = await requireStaff("quotes.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const q = one(sp.q).trim();
  const conds: (SQL | undefined)[] = [];
  if (q) conds.push(or(ilike(quotes.number, `%${q}%`), ilike(quotes.contactName, `%${q}%`), ilike(quotes.companyName, `%${q}%`), ilike(customers.companyName, `%${q}%`), ilike(customers.lastName, `%${q}%`)));
  if (one(sp.statut)) conds.push(sql`${quotes.status} = ${one(sp.statut)}`);
  if (one(sp.source) === "web") conds.push(sql`${quotes.source} like 'web%'`);
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ q: quotes, company: customers.companyName, first: customers.firstName, last: customers.lastName }).from(quotes).leftJoin(customers, eq(customers.id, quotes.customerId)).where(where).orderBy(desc(quotes.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(quotes).leftJoin(customers, eq(customers.id, quotes.customerId)).where(where),
  ]);
  return (
    <>
      <PageHeader title="Devis" description="Demandes web (site et panier) et devis établis par l'équipe." actions={me.can("quotes.create") && <Link href="/admin/devis/nouveau" className={btn.primary}><Plus className="size-4" /> Nouveau devis</Link>} />
      <FilterBar action="/admin/devis" q={q} placeholder="N°, client, société, contact…">
        <FilterSelect name="statut" label="Tous les statuts" value={one(sp.statut)} options={Object.entries(QUOTE_STATUS).map(([k, v]) => [k, v.label])} />
        <FilterSelect name="source" label="Toutes origines" value={one(sp.source)} options={[["web", "Demandes du site"]]} />
      </FilterBar>
      <Card padded={false}>
        <Table>
          <thead><tr><Th>N°</Th><Th>Date</Th><Th>Client / contact</Th><Th>Origine</Th><Th>Statut</Th><Th className="text-right">Total TTC</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6} />}
            {rows.map(({ q: d, company, first, last }) => (
              <tr key={d.id} className="hover:bg-mist/40">
                <Td><Link href={`/admin/devis/${d.id}`} className="font-mono text-xs font-semibold text-accent">{d.number}</Link></Td>
                <Td className="text-steel">{formatDate(d.createdAt)}</Td>
                <Td>{company || [first, last].filter(Boolean).join(" ") || d.companyName || d.contactName}<p className="text-xs text-steel">{d.contactPhone}</p></Td>
                <Td className="text-xs text-steel">{d.source === "web" ? "Formulaire site" : d.source === "web_cart" ? "Panier site" : "Back-office"}</Td>
                <Td><Badge tone={label(QUOTE_STATUS, d.status).tone}>{label(QUOTE_STATUS, d.status).label}</Badge></Td>
                <Td className="text-right font-semibold tabular-nums">{formatTND(d.total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} href={(n) => listHref("/admin/devis", sp, { page: n })} />
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
