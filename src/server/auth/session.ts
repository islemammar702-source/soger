import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "soger_session";
const DURATION_DAYS = 30;
const RENEW_BELOW_DAYS = 15;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DURATION_DAYS * 86_400_000);
  const h = await headers();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Nettoyage opportuniste des sessions expirées.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Utilisateur de la session courante (ou null). Prolonge la session si elle approche de l'expiration. */
export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      kind: users.kind,
      isActive: users.isActive,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row || !row.isActive) return null;
  if (row.expiresAt.getTime() - Date.now() < RENEW_BELOW_DAYS * 86_400_000) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + DURATION_DAYS * 86_400_000) })
      .where(eq(sessions.id, id));
  }
  return { id: row.id, name: row.name, email: row.email, kind: row.kind };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

/** Déconnecte toutes les sessions d'un utilisateur (changement de mot de passe, désactivation). */
export async function destroyUserSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Indice non sensible pour l'interface (affichage des prix pros). Jamais utilisé pour autoriser quoi que ce soit. */
export async function setTierHint(pro: boolean) {
  const store = await cookies();
  if (pro) store.set("soger_tier", "pro", { sameSite: "lax", path: "/", maxAge: DURATION_DAYS * 86_400, secure: process.env.NODE_ENV === "production" });
  else store.delete("soger_tier");
}
