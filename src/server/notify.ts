import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { notifications, permissions, rolePermissions, userRoles, users } from "@/db/schema";
import type { Permission } from "@/lib/permissions";
import type { Tx } from "./audit";

/** Notifie tous les membres du personnel disposant d'une permission. */
export async function notifyStaff(tx: Tx, permission: Permission, n: { type: string; title: string; body?: string; link?: string }) {
  const recipients = await tx
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(users.kind, "staff"), eq(users.isActive, true), eq(permissions.key, permission)));
  if (recipients.length) await tx.insert(notifications).values(recipients.map((r) => ({ userId: r.id, ...n })));
}

export async function notifyUser(tx: Tx, userId: number | null | undefined, n: { type: string; title: string; body?: string; link?: string }) {
  if (userId) await tx.insert(notifications).values({ userId, ...n });
}

export const unreadCount = (tx: Tx, userId: number) =>
  tx.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
