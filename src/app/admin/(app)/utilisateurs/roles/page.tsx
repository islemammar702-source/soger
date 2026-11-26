import { asc } from "drizzle-orm";
import { db } from "@/db";
import { permissions, rolePermissions, roles } from "@/db/schema";
import { Card, Flash, PageHeader } from "@/components/admin/ui";
import { MODULES } from "@/lib/permissions";
import { saveRolePermissionsAction } from "@/server/admin/system";
import { requireStaff } from "@/server/auth/dal";

const MODULE_LABEL: Record<string, string> = {
  dashboard: "Tableau de bord", products: "Produits", categories: "Catégories", brands: "Marques", stock: "Stock", customers: "Clients", suppliers: "Fournisseurs",
  quotes: "Devis", orders: "Commandes", pos: "Caisse", purchases: "Achats", invoices: "Factures", payments: "Paiements", expenses: "Dépenses", reports: "Rapports",
  users: "Utilisateurs", audit: "Journal", settings: "Paramètres",
};
const ACTION_LABEL: Record<string, string> = {
  view: "voir", create: "créer", update: "modifier", delete: "supprimer", publish: "publier", import: "importer", export: "exporter", view_cost: "voir les coûts",
  adjust: "ajuster", transfer: "transférer", inventory: "inventaire", receive: "réceptionner", view_balance: "voir le solde", send: "envoyer", convert: "convertir",
  cancel: "annuler", return: "retours", use: "utiliser", discount: "remises", refund: "rembourser", close_register: "clôturer", issue: "émettre", assign_roles: "attribuer les rôles",
};

export default async function RolesPage({ searchParams }: PageProps<"/admin/utilisateurs/roles">) {
  const me = await requireStaff("users.view");
  const sp = await searchParams;
  const [allRoles, perms, links] = await Promise.all([db.select().from(roles).orderBy(asc(roles.id)), db.select().from(permissions), db.select().from(rolePermissions)]);
  const editable = me.roles.includes("super_admin");
  const permId = new Map(perms.map((p) => [p.key, p.id]));
  return (
    <>
      <PageHeader title="Rôles et permissions" description="Chaque action du back-office est vérifiée côté serveur selon cette matrice." back={{ href: "/admin/utilisateurs", label: "Utilisateurs" }} />
      <Flash sp={sp} />
      <div className="space-y-6">
        {allRoles.map((r) => {
          const has = new Set(links.filter((l) => l.roleId === r.id).map((l) => l.permissionId));
          const locked = !editable || r.key === "super_admin";
          return (
            <Card key={r.id} title={`${r.name}${r.key === "super_admin" ? " — accès total" : ""}`}>
              <p className="mb-4 text-sm text-steel">{r.description}</p>
              <form action={saveRolePermissionsAction}>
                <input type="hidden" name="roleId" value={r.id} />
                <fieldset disabled={locked} className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(MODULES).map(([m, actions]) => (
                    <div key={m}>
                      <p className="mb-1 text-xs font-semibold tracking-wide text-steel uppercase">{MODULE_LABEL[m]}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {actions.map((a) => {
                          const key = `${m}.${a}`;
                          return <label key={key} className="flex items-center gap-1 text-xs"><input type="checkbox" name="perm" value={key} defaultChecked={r.key === "super_admin" || has.has(permId.get(key)!)} /> {ACTION_LABEL[a] ?? a}</label>;
                        })}
                      </div>
                    </div>
                  ))}
                </fieldset>
                {!locked && <button className="mt-4 h-9 rounded-md bg-ink px-4 text-sm text-white">Enregistrer « {r.name} »</button>}
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
