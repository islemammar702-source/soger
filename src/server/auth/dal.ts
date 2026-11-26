import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { auditLogs, customers, permissions, rolePermissions, roles, userRoles } from "@/db/schema";
import type { Permission } from "@/lib/permissions";
import { readSession } from "./session";

/**
 * Couche d'accès aux données (DAL) : TOUTES les vérifications d'accès passent ici,
 * côté serveur. Le menu masqué côté interface n'est qu'un confort, jamais une sécurité.
 */
export const getCurrentUser = cache(readSession);

export const getUserAccess = cache(async (userId: number) => {
  const rows = await db
    .select({ role: roles.key, roleName: roles.name, permission: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));
  return {
    roles: [...new Set(rows.map((r) => r.role))],
    roleNames: [...new Set(rows.map((r) => r.roleName))],
    permissions: new Set(rows.map((r) => r.permission).filter(Boolean) as Permission[]),
  };
});

export class AccessDenied extends Error {
  constructor(public permission?: string) {
    super(permission ? `Permission requise : ${permission}` : "Accès refusé");
  }
}

/** Pour les pages du back-office : redirige si non connecté, page « accès refusé » si permission manquante. */
export async function requireStaff(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") redirect("/admin/connexion");
  const access = await getUserAccess(user.id);
  if (permission && !access.permissions.has(permission)) redirect(`/admin/acces-refuse?p=${encodeURIComponent(permission)}`);
  return { ...user, ...access, can: (p: Permission) => access.permissions.has(p) };
}

/** Pour les actions serveur : lève AccessDenied au lieu de rediriger. */
export async function assertStaff(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") throw new AccessDenied();
  const access = await getUserAccess(user.id);
  if (permission && !access.permissions.has(permission)) throw new AccessDenied(permission);
  return { ...user, ...access, can: (p: Permission) => access.permissions.has(p) };
}

/** Client connecté + sa fiche client. */
export const getCurrentCustomer = cache(async () => {
  const user = await getCurrentUser();
  if (!user || user.kind !== "customer") return null;
  const [customer] = await db.select().from(customers).where(eq(customers.userId, user.id));
  return customer ? { user, customer } : null;
});

/** Espace client : sans session, renvoie vers la connexion dans la langue de la page (« /ar/compte/… »). */
export async function requireCustomer(next = "/compte") {
  const c = await getCurrentCustomer();
  if (!c) {
    const lang = /^\/(fr|en|ar)(\/|$)/.exec(next)?.[1];
    redirect(`${lang ? `/${lang}` : ""}/compte/connexion?suite=${encodeURIComponent(next)}`);
  }
  return c;
}

/** Client professionnel validé : voit les prix pros. */
export function isApprovedPro(customer: { type: string; priceTier: string } | null | undefined) {
  return !!customer && customer.type === "professional" && customer.priceTier === "professional";
}

/** Limitation des tentatives de connexion (5 échecs / 15 min par identifiant), stockée en base. */
export async function tooManyLoginAttempts(email: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "login_failed"), eq(auditLogs.entityId, email), gt(auditLogs.createdAt, new Date(Date.now() - 15 * 60_000))));
  return row.n >= 5;
}
