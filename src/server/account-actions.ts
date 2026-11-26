"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { customers, favorites, notifications, users } from "@/db/schema";
import { audit } from "./audit";
import { getCurrentCustomer, getCurrentUser, tooManyLoginAttempts } from "./auth/dal";
import { hashPassword, passwordProblem, verifyPassword } from "./auth/password";
import { createSession, destroySession, destroyUserSessions, setTierHint } from "./auth/session";
import { BusinessError, createOrder, findOrCreateCustomer, priceProducts } from "./orders";
import { notifyStaff } from "./notify";
import { nextDocumentNumber } from "./sequences";
import { getSettings } from "./settings";

export type FormState = { status: "idle" } | { status: "error"; message: string; fieldErrors?: Record<string, string[] | undefined> } | { status: "success"; message?: string; data?: Record<string, string> };

const phone = z.string().trim().regex(/^[+\d][\d\s.-]{6,19}$/, "Numéro de téléphone invalide");
const safeNext = (v: unknown, fallback: string) => (typeof v === "string" && /^\/(?!\/)[\w\-/?=&%.]*$/.test(v) ? v : fallback);
/** Langue du site d'où vient le formulaire (champ caché « lang »), pour les redirections. */
const langPrefix = (form: FormData) => {
  const l = form.get("lang");
  return l === "fr" || l === "en" || l === "ar" ? `/${l}` : "";
};
const fieldErrors = (e: z.ZodError) => z.flattenError(e).fieldErrors as Record<string, string[] | undefined>;

/* ─── Inscription ─────────────────────────────────────────────────── */

const registerSchema = z
  .object({
    type: z.enum(["individual", "professional"]),
    name: z.string().trim().min(2, "Indiquez votre nom").max(120),
    email: z.email("Adresse e-mail invalide").transform((v) => v.toLowerCase()),
    phone,
    password: z.string(),
    company: z.string().trim().max(160).optional(),
    taxId: z.string().trim().max(40).optional(),
    activity: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(80).optional(),
    governorate: z.string().trim().max(80).optional(),
    terms: z.literal("on", { error: "Vous devez accepter les conditions" }),
  })
  .superRefine((d, ctx) => {
    const pw = passwordProblem(d.password);
    if (pw) ctx.addIssue({ code: "custom", path: ["password"], message: pw });
    if (d.type === "professional" && !d.company) ctx.addIssue({ code: "custom", path: ["company"], message: "Raison sociale obligatoire" });
    if (d.type === "professional" && !d.taxId) ctx.addIssue({ code: "custom", path: ["taxId"], message: "Matricule fiscal obligatoire" });
  });

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Merci de vérifier les champs indiqués.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email));
  if (exists) return { status: "error", message: "Un compte existe déjà avec cette adresse e-mail.", fieldErrors: { email: ["Adresse déjà utilisée"] } };

  const passwordHash = await hashPassword(d.password);
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ kind: "customer", name: d.name, email: d.email, phone: d.phone, passwordHash }).returning({ id: users.id });
    const code = await nextDocumentNumber(tx, "customer");
    const [first, ...rest] = d.name.split(/\s+/);
    const [customer] = await tx
      .insert(customers)
      .values({
        userId: user.id,
        code,
        type: d.type,
        // Les prix pros ne sont visibles qu'après validation par SOGER.
        priceTier: "retail",
        firstName: first,
        lastName: rest.join(" ") || null,
        companyName: d.company || null,
        taxId: d.taxId || null,
        activity: d.activity || null,
        email: d.email,
        phone: d.phone,
        address: d.address || null,
        city: d.city || null,
        governorate: d.governorate || null,
      })
      .returning({ id: customers.id });
    if (d.type === "professional") {
      await notifyStaff(tx, "customers.update", {
        type: "pro_request",
        title: "Nouvelle demande de compte professionnel",
        body: `${d.company} (${d.taxId})`,
        link: `/admin/clients/${customer.id}`,
      });
    }
    await audit({ userId: user.id, module: "customers", action: "register", entityType: "customer", entityId: customer.id, newValues: { type: d.type, email: d.email } }, tx);
    return user.id;
  });
  await createSession(userId);
  redirect(`${langPrefix(form)}/compte?bienvenue=${d.type === "professional" ? "pro" : "1"}`);
}

/* ─── Connexion / déconnexion ────────────────────────────────────── */

const loginSchema = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200), suite: z.string().optional(), area: z.enum(["customer", "staff"]) });

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Identifiants invalides." };
  const { email, password, area } = parsed.data;
  if (await tooManyLoginAttempts(email)) {
    return { status: "error", message: "Trop de tentatives. Réessayez dans 15 minutes." };
  }
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(password, user?.passwordHash);
  // Bon mot de passe mais mauvaise entrée : on l'indique (le mot de passe étant correct, rien n'est révélé à un tiers).
  if (user && ok && user.isActive && user.kind !== area) {
    return {
      status: "error",
      message: user.kind === "staff"
        ? "Ce compte est un compte du personnel SOGER : connectez-vous sur la page de gestion, /admin/connexion."
        : "Ce compte est un compte client : connectez-vous depuis l'espace client du site, /compte/connexion.",
    };
  }
  if (!user || !ok || !user.isActive || user.kind !== area) {
    await audit({ userId: user?.id ?? null, module: "auth", action: "login_failed", entityType: "email", entityId: email });
    return { status: "error", message: "E-mail ou mot de passe incorrect." };
  }
  await createSession(user.id);
  if (area === "customer") {
    const [c] = await db.select({ type: customers.type, priceTier: customers.priceTier }).from(customers).where(eq(customers.userId, user.id));
    await setTierHint(!!c && c.type === "professional" && c.priceTier === "professional");
  }
  await audit({ userId: user.id, module: "auth", action: "login", entityType: "user", entityId: user.id });
  redirect(safeNext(parsed.data.suite, area === "staff" ? "/admin" : `${langPrefix(form)}/compte`));
}

export async function logoutAction(form: FormData) {
  const user = await getCurrentUser();
  await destroySession();
  await setTierHint(false);
  if (user) await audit({ userId: user.id, module: "auth", action: "logout", entityType: "user", entityId: user.id });
  redirect(form.get("area") === "staff" ? "/admin/connexion" : langPrefix(form) || "/");
}

/* ─── Profil ─────────────────────────────────────────────────────── */

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone,
  company: z.string().trim().max(160).optional(),
  taxId: z.string().trim().max(40).optional(),
  activity: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  governorate: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(10).optional(),
});

export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const me = await getCurrentCustomer();
  if (!me) return { status: "error", message: "Session expirée, reconnectez-vous." };
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Merci de vérifier les champs indiqués.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const [first, ...rest] = d.name.split(/\s+/);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: d.name, phone: d.phone }).where(eq(users.id, me.user.id));
    await tx
      .update(customers)
      .set({
        firstName: first,
        lastName: rest.join(" ") || null,
        phone: d.phone,
        companyName: d.company || null,
        // Le matricule d'un pro déjà validé ne peut être modifié que par SOGER.
        taxId: me.customer.priceTier === "professional" ? me.customer.taxId : d.taxId || null,
        activity: d.activity || null,
        address: d.address || null,
        city: d.city || null,
        governorate: d.governorate || null,
        postalCode: d.postalCode || null,
      })
      .where(eq(customers.id, me.customer.id));
    await audit({ userId: me.user.id, module: "customers", action: "update_profile", entityType: "customer", entityId: me.customer.id }, tx);
  });
  for (const l of ["fr", "en", "ar"]) revalidatePath(`/${l}/compte`);
  return { status: "success", message: "Profil mis à jour." };
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée, reconnectez-vous." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!(await verifyPassword(current, row?.hash))) return { status: "error", message: "Mot de passe actuel incorrect.", fieldErrors: { current: ["Incorrect"] } };
  const problem = passwordProblem(next);
  if (problem) return { status: "error", message: problem, fieldErrors: { next: [problem] } };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  await destroyUserSessions(user.id);
  await createSession(user.id);
  await audit({ userId: user.id, module: "auth", action: "change_password", entityType: "user", entityId: user.id });
  return { status: "success", message: "Mot de passe modifié. Vos autres sessions ont été déconnectées." };
}

/* ─── Favoris & notifications ────────────────────────────────────── */

export async function toggleFavoriteAction(productId: number): Promise<{ ok: boolean; favorite?: boolean; login?: boolean }> {
  const me = await getCurrentCustomer();
  if (!me) return { ok: false, login: true };
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false };
  const [existing] = await db.select().from(favorites).where(and(eq(favorites.userId, me.user.id), eq(favorites.productId, productId)));
  if (existing) await db.delete(favorites).where(and(eq(favorites.userId, me.user.id), eq(favorites.productId, productId)));
  else await db.insert(favorites).values({ userId: me.user.id, productId }).onConflictDoNothing();
  for (const l of ["fr", "en", "ar"]) revalidatePath(`/${l}/compte/favoris`);
  return { ok: true, favorite: !existing };
}

export async function markNotificationsReadAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  for (const l of ["fr", "en", "ar"]) revalidatePath(`/${l}/compte/notifications`);
  revalidatePath("/admin");
}

/* ─── Passage de commande ────────────────────────────────────────── */

const checkoutSchema = z
  .object({
    name: z.string().trim().min(2, "Indiquez votre nom").max(120),
    company: z.string().trim().max(160).optional(),
    taxId: z.string().trim().max(40).optional(),
    phone,
    email: z.union([z.literal(""), z.email("Adresse e-mail invalide")]).optional(),
    delivery: z.enum(["pickup", "delivery"]),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(80).optional(),
    governorate: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(10).optional(),
    payment: z.enum(["cash_on_delivery", "transfer", "cash"]),
    notes: z.string().trim().max(1000).optional(),
    items: z.string(),
    website: z.string().max(0).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.delivery === "delivery") {
      if (!d.address) ctx.addIssue({ code: "custom", path: ["address"], message: "Adresse obligatoire pour la livraison" });
      if (!d.city) ctx.addIssue({ code: "custom", path: ["city"], message: "Ville obligatoire" });
    }
    if (d.payment === "cash_on_delivery" && d.delivery !== "delivery") ctx.addIssue({ code: "custom", path: ["payment"], message: "Le paiement à la livraison nécessite une livraison" });
    if (d.payment === "cash" && d.delivery !== "pickup") ctx.addIssue({ code: "custom", path: ["payment"], message: "Le paiement en magasin nécessite un retrait en magasin" });
  });

const itemsSchema = z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(9999) })).min(1).max(200);

export async function placeOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Merci de vérifier les champs indiqués.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  if (d.website) return { status: "error", message: "Requête refusée." };
  let rawItems: unknown = null;
  try {
    rawItems = JSON.parse(d.items);
  } catch {}
  const items = itemsSchema.safeParse(rawItems);
  if (!items.success) return { status: "error", message: "Votre panier est vide ou invalide." };

  const me = await getCurrentCustomer();
  const settings = await getSettings();

  try {
    const result = await db.transaction(async (tx) => {
      const customer =
        me?.customer ??
        (await findOrCreateCustomer(tx, {
          name: d.name,
          company: d.company,
          taxId: d.taxId,
          phone: d.phone,
          email: d.email || null,
          address: d.address,
          city: d.city,
          governorate: d.governorate,
          postalCode: d.postalCode,
        }));

      // Frais de livraison : calculés côté serveur depuis les paramètres.
      let fee = 0;
      if (d.delivery === "delivery") {
        fee = Number(settings.sales.deliveryFee) || 0;
        const free = Number(settings.sales.freeDeliveryFrom);
        if (free > 0) {
          const priced = await priceProducts(tx, items.data.map((i) => i.productId), customer);
          const ttc = items.data.reduce((s, i) => {
            const p = priced.get(i.productId);
            return s + (p?.price ?? 0) * i.quantity * (1 + (p?.vat ?? 0) / 100);
          }, 0);
          if (ttc >= free) fee = 0;
        }
      }
      // Les frais sont saisis TTC dans les paramètres → base HT pour la TVA à 19 %.
      const feeHT = Math.round((fee / 1.19) * 1000) / 1000;

      const order = await createOrder(tx, {
        channel: "online",
        customer,
        lines: items.data,
        paymentMethod: d.payment,
        deliveryMethod: d.delivery === "pickup" ? "Retrait en magasin" : "Livraison",
        shipping: {
          name: d.company ? `${d.name} — ${d.company}` : d.name,
          phone: d.phone,
          address: d.delivery === "delivery" ? d.address : undefined,
          city: d.city,
          governorate: d.governorate,
          postalCode: d.postalCode,
          fee: feeHT,
        },
        notes: d.notes || null,
        createdBy: me?.user.id ?? null,
      });
      await notifyStaff(tx, "orders.view", {
        type: "new_order",
        title: `Nouvelle commande en ligne ${order.number}`,
        body: `${d.name} — ${order.total} DT`,
        link: `/admin/commandes/${order.id}`,
      });
      await audit({ userId: me?.user.id ?? null, module: "orders", action: "create_online", entityType: "order", entityId: order.id, newValues: { number: order.number, total: order.total } }, tx);
      return order;
    });
    return { status: "success", data: { number: result.number, total: result.total, payment: d.payment, delivery: d.delivery, account: me ? "1" : "" } };
  } catch (e) {
    if (e instanceof BusinessError) return { status: "error", message: e.message };
    console.error("placeOrderAction", e);
    return { status: "error", message: "La commande n'a pas pu être enregistrée. Réessayez ou contactez-nous." };
  }
}
