"use server";

import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { permissions, rolePermissions, roles, settings, userRoles, users } from "@/db/schema";
import { audit } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { hashPassword } from "../auth/password";
import { destroyUserSessions } from "../auth/session";
import { DEFAULT_SETTINGS } from "../settings";
import type { FormState } from "../account-actions";

const tempPassword = () => randomBytes(9).toString("base64url");
const back = (path: string, msg: string, ok = true) => redirect(`${path}?${ok ? "ok" : "erreur"}=${encodeURIComponent(msg)}`);

/** Création d'un compte du personnel : mot de passe provisoire affiché une seule fois. */
export async function createStaffAction(_: FormState, form: FormData): Promise<FormState> {
  let me;
  try {
    me = await assertStaff("users.create");
  } catch (e) {
    return { status: "error", message: e instanceof AccessDenied ? e.message : "Accès refusé" };
  }
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), email: z.email("E-mail invalide").transform((v) => v.toLowerCase()), roleId: z.coerce.number().int().positive() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Vérifiez le nom, l'e-mail et le rôle." };
  const d = parsed.data;
  const [role] = await db.select().from(roles).where(eq(roles.id, d.roleId));
  if (!role) return { status: "error", message: "Rôle inconnu." };
  if (role.key === "super_admin" && !me.roles.includes("super_admin")) return { status: "error", message: "Seul un super administrateur peut créer un super administrateur." };
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email));
  if (exists) return { status: "error", message: "Un compte existe déjà avec cet e-mail." };
  const password = tempPassword();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ kind: "staff", name: d.name, email: d.email, passwordHash }).returning({ id: users.id });
    await tx.insert(userRoles).values({ userId: u.id, roleId: role.id });
    await audit({ userId: me.id, module: "users", action: "create", entityType: "user", entityId: u.id, newValues: { email: d.email, role: role.key } }, tx);
  });
  return { status: "success", message: `Compte créé pour ${d.email}. Mot de passe provisoire (à transmettre, affiché une seule fois) : ${password}` };
}

export async function setUserRoleAction(form: FormData) {
  const me = await assertStaff("users.assign_roles");
  const userId = Number(form.get("userId"));
  const roleIds = form.getAll("roleId").map(Number).filter(Boolean);
  if (userId === me.id) back("/admin/utilisateurs", "Vous ne pouvez pas modifier vos propres rôles.", false);
  const chosen = roleIds.length ? await db.select().from(roles).where(inArray(roles.id, roleIds)) : [];
  if (chosen.some((r) => r.key === "super_admin") && !me.roles.includes("super_admin")) back("/admin/utilisateurs", "Seul un super administrateur peut attribuer ce rôle.", false);
  await db.transaction(async (tx) => {
    const before = await tx.select({ id: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (chosen.length) await tx.insert(userRoles).values(chosen.map((r) => ({ userId, roleId: r.id })));
    await audit({ userId: me.id, module: "users", action: "set_roles", entityType: "user", entityId: userId, oldValues: before.map((b) => b.id), newValues: chosen.map((r) => r.key) }, tx);
  });
  back("/admin/utilisateurs", "Rôles mis à jour.");
}

export async function toggleUserAction(form: FormData) {
  const me = await assertStaff("users.update");
  const userId = Number(form.get("userId"));
  if (userId === me.id) back("/admin/utilisateurs", "Vous ne pouvez pas désactiver votre propre compte.", false);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) back("/admin/utilisateurs", "Utilisateur introuvable.", false);
  await db.update(users).set({ isActive: !u.isActive }).where(eq(users.id, userId));
  if (u.isActive) await destroyUserSessions(userId);
  await audit({ userId: me.id, module: "users", action: u.isActive ? "deactivate" : "activate", entityType: "user", entityId: userId });
  back("/admin/utilisateurs", u.isActive ? "Compte désactivé (sessions fermées)." : "Compte réactivé.");
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  let me;
  try {
    me = await assertStaff("users.update");
  } catch (e) {
    return { status: "error", message: e instanceof AccessDenied ? e.message : "Accès refusé" };
  }
  const userId = Number(form.get("userId"));
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { status: "error", message: "Utilisateur introuvable." };
  const password = tempPassword();
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
  await destroyUserSessions(userId);
  await audit({ userId: me.id, module: "users", action: "reset_password", entityType: "user", entityId: userId });
  return { status: "success", message: `Nouveau mot de passe provisoire pour ${u.email} : ${password}` };
}

/** Matrice des permissions d'un rôle (le super administrateur garde toujours tout). */
export async function saveRolePermissionsAction(form: FormData) {
  const me = await assertStaff("users.assign_roles");
  if (!me.roles.includes("super_admin")) back("/admin/utilisateurs/roles", "Réservé au super administrateur.", false);
  const roleId = Number(form.get("roleId"));
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role || role.key === "super_admin") back("/admin/utilisateurs/roles", "Ce rôle ne peut pas être modifié.", false);
  const keys = form.getAll("perm").map(String);
  const perms = keys.length ? await db.select({ id: permissions.id, key: permissions.key }).from(permissions).where(inArray(permissions.key, keys)) : [];
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (perms.length) await tx.insert(rolePermissions).values(perms.map((p) => ({ roleId, permissionId: p.id })));
    await audit({ userId: me.id, module: "users", action: "role_permissions", entityType: "role", entityId: role.key, newValues: perms.map((p) => p.key) }, tx);
  });
  back("/admin/utilisateurs/roles", `Permissions du rôle « ${role.name} » enregistrées.`);
}

/* ─── Paramètres ───────────────────────────────────────────────────── */

const settingsSchema = z.object({
  company: z.object({
    name: z.string().trim().min(1).max(80),
    legalName: z.string().trim().min(1).max(160),
    taxId: z.string().trim().max(40),
    tradeRegister: z.string().trim().max(40),
    address: z.string().trim().max(200),
    city: z.string().trim().max(80),
    phone: z.string().trim().max(40),
    email: z.string().trim().max(120),
    bank: z.string().trim().max(300),
  }),
  sales: z.object({
    defaultVatRate: z.enum(["0.00", "7.00", "13.00", "19.00"]),
    stampDuty: z.string().regex(/^\d+(\.\d{1,3})?$/, "Montant invalide"),
    quoteValidityDays: z.coerce.number().int().min(1).max(365),
    deliveryFee: z.string().regex(/^\d+(\.\d{1,3})?$/, "Montant invalide"),
    freeDeliveryFrom: z.string().regex(/^(\d+(\.\d{1,3})?)?$/, "Montant invalide"),
    invoiceFooter: z.string().trim().max(300),
    paymentTermsDays: z.coerce.number().int().min(0).max(365),
  }),
});

export async function saveSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  let me;
  try {
    me = await assertStaff("settings.update");
  } catch (e) {
    return { status: "error", message: e instanceof AccessDenied ? e.message : "Accès refusé" };
  }
  const raw: Record<string, Record<string, string>> = { company: {}, sales: {} };
  for (const [k, v] of form.entries()) {
    const [group, key] = k.split(".");
    if ((group === "company" || group === "sales") && key in DEFAULT_SETTINGS[group]) raw[group][key] = String(v).replace(",", ".");
  }
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: `Paramètre invalide : ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}` };
  await db.transaction(async (tx) => {
    for (const key of ["company", "sales"] as const) {
      await tx.insert(settings).values({ key, value: parsed.data[key], updatedBy: me.id }).onConflictDoUpdate({ target: settings.key, set: { value: parsed.data[key], updatedAt: new Date(), updatedBy: me.id } });
    }
    await audit({ userId: me.id, module: "settings", action: "update", entityType: "settings", newValues: parsed.data }, tx);
  });
  updateTag("settings");
  return { status: "success", message: "Paramètres enregistrés." };
}
