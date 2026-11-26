import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { roles, userRoles, users } from "@/db/schema";
import { CreateStaffForm, ResetPasswordButton } from "@/components/admin/system-forms";
import { Card, Flash, PageHeader, Table, Td, Th, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/labels";
import { setUserRoleAction, toggleUserAction } from "@/server/admin/system";
import { requireStaff } from "@/server/auth/dal";

export default async function UsersPage({ searchParams }: PageProps<"/admin/utilisateurs">) {
  const me = await requireStaff("users.view");
  const sp = await searchParams;
  const [staff, allRoles, links] = await Promise.all([
    db.select().from(users).where(eq(users.kind, "staff")).orderBy(asc(users.name)),
    db.select().from(roles).orderBy(asc(roles.id)),
    db.select().from(userRoles),
  ]);
  const assignable = allRoles.filter((r) => r.key !== "super_admin" || me.roles.includes("super_admin"));
  return (
    <>
      <PageHeader title="Utilisateurs" description="Comptes du personnel et rôles. Les clients web sont gérés dans « Clients »." actions={<Link href="/admin/utilisateurs/roles" className={btn.outline}>Rôles et permissions</Link>} />
      <Flash sp={sp} />
      {me.can("users.create") && <Card title="Nouveau compte" className="mb-6"><CreateStaffForm roles={assignable} /></Card>}
      <Card padded={false}>
        <Table minWidth={980}>
          <thead><tr><Th>Nom</Th><Th>E-mail</Th><Th>Rôle(s)</Th><Th>Dernière connexion</Th><Th>Statut</Th><Th /></tr></thead>
          <tbody>
            {staff.map((u) => {
              const mine = links.filter((l) => l.userId === u.id).map((l) => l.roleId);
              const self = u.id === me.id;
              return (
                <tr key={u.id} className="align-top">
                  <Td className="font-medium">{u.name}{self && <span className="ml-1 text-xs text-steel">(vous)</span>}</Td>
                  <Td className="text-steel">{u.email}</Td>
                  <Td>
                    {me.can("users.assign_roles") && !self ? (
                      <form action={setUserRoleAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        {assignable.map((r) => (
                          <label key={r.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="roleId" value={r.id} defaultChecked={mine.includes(r.id)} /> {r.name}</label>
                        ))}
                        <button className="h-7 rounded-md bg-ink px-2 text-xs text-white">OK</button>
                      </form>
                    ) : (
                      allRoles.filter((r) => mine.includes(r.id)).map((r) => <Badge key={r.id} className="mr-1">{r.name}</Badge>)
                    )}
                  </Td>
                  <Td className="text-xs text-steel">{formatDateTime(u.lastLoginAt)}</Td>
                  <Td>{u.isActive ? <Badge tone="bg-accent-soft text-accent-hover">Actif</Badge> : <Badge tone="bg-red-50 text-red-700">Désactivé</Badge>}</Td>
                  <Td>
                    {me.can("users.update") && !self && (
                      <div className="space-y-1">
                        <form action={toggleUserAction}><input type="hidden" name="userId" value={u.id} /><button className={`text-xs font-medium ${u.isActive ? "text-danger" : "text-accent"}`}>{u.isActive ? "Désactiver" : "Réactiver"}</button></form>
                        <ResetPasswordButton userId={u.id} />
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
