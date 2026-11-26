import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { Card, EmptyRow, FilterSelect, PageHeader, Pagination, Table, Td, Th, listHref, one } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/labels";
import { requireStaff } from "@/server/auth/dal";

const PAGE = 50;
const short = (v: unknown) => {
  if (v == null) return "";
  const s = JSON.stringify(v);
  return s.length > 300 ? s.slice(0, 300) + "…" : s;
};

export default async function AuditPage({ searchParams }: PageProps<"/admin/journal">) {
  await requireStaff("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const conds: (SQL | undefined)[] = [];
  if (one(sp.module)) conds.push(eq(auditLogs.module, one(sp.module)));
  if (Number(one(sp.utilisateur))) conds.push(eq(auditLogs.userId, Number(one(sp.utilisateur))));
  if (one(sp.action)) conds.push(sql`${auditLogs.action} ilike ${"%" + one(sp.action) + "%"}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(sp.du))) conds.push(gte(auditLogs.createdAt, new Date(one(sp.du))));
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(sp.au))) conds.push(lt(auditLogs.createdAt, new Date(new Date(one(sp.au)).getTime() + 86_400_000)));
  const where = and(...conds);
  const [rows, [{ total }], modules, staff] = await Promise.all([
    db.select({ a: auditLogs, user: users.name }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId)).where(where).orderBy(desc(auditLogs.id)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
    db.selectDistinct({ m: auditLogs.module }).from(auditLogs).orderBy(auditLogs.module),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.kind, "staff")),
  ]);
  return (
    <>
      <PageHeader title="Journal d'activité" description="Qui a fait quoi, quand, avec les valeurs avant / après. Non modifiable." />
      <form action="/admin/journal" className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect name="module" label="Tous les modules" value={one(sp.module)} options={modules.map((m) => [m.m, m.m])} />
        <FilterSelect name="utilisateur" label="Tous les utilisateurs" value={one(sp.utilisateur)} options={staff.map((u) => [String(u.id), u.name])} />
        <input name="action" defaultValue={one(sp.action)} placeholder="Action (ex. delete)" className="h-10 w-40 rounded-lg border border-line bg-white px-3 text-sm" />
        <input type="date" name="du" defaultValue={one(sp.du)} aria-label="Du" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <input type="date" name="au" defaultValue={one(sp.au)} aria-label="Au" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <button className="h-10 rounded-lg bg-ink px-4 text-sm text-white">Filtrer</button>
      </form>
      <Card padded={false}>
        <Table minWidth={1100}>
          <thead><tr><Th>Date</Th><Th>Utilisateur</Th><Th>Module</Th><Th>Action</Th><Th>Objet</Th><Th>Avant</Th><Th>Après</Th><Th>IP</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8} />}
            {rows.map(({ a, user }) => (
              <tr key={a.id} className="align-top">
                <Td className="whitespace-nowrap text-xs text-steel">{formatDateTime(a.createdAt)}</Td>
                <Td className="text-xs">{user ?? "—"}</Td>
                <Td className="text-xs">{a.module}</Td>
                <Td className={`text-xs font-medium ${/delete|failed|cancel|revoke|deactivate/.test(a.action) ? "text-danger" : ""}`}>{a.action}</Td>
                <Td className="font-mono text-xs">{a.entityType}{a.entityId ? ` #${a.entityId}` : ""}</Td>
                <Td className="max-w-64 font-mono text-[11px] break-all text-steel">{short(a.oldValues)}</Td>
                <Td className="max-w-64 font-mono text-[11px] break-all">{short(a.newValues)}</Td>
                <Td className="text-xs text-steel">{a.ip}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} href={(n) => listHref("/admin/journal", sp, { page: n })} />
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
