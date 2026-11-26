/**
 * Crée (ou réactive) un compte du personnel avec un rôle.
 *
 *   npm run admin:create -- --email vous@soger.tn --name "Votre nom" [--role super_admin]
 *
 * Un mot de passe aléatoire est généré et affiché UNE SEULE FOIS : changez-le ensuite.
 */
import "dotenv/config";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, o: object) => Promise<Buffer>;

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name") ?? "Administrateur";
  const roleKey = arg("role") ?? "super_admin";
  if (!email) throw new Error('Usage : npm run admin:create -- --email vous@soger.tn --name "Votre nom" [--role super_admin]');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema: s });
  const [role] = await db.select().from(s.roles).where(eq(s.roles.key, roleKey));
  if (!role) throw new Error(`Rôle inconnu : ${roleKey}. Lancez d'abord « npm run db:seed ».`);

  const password = randomBytes(12).toString("base64url");
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const passwordHash = `scrypt$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(s.users).where(eq(s.users.email, email));
    if (existing && existing.kind !== "staff") throw new Error("Cet e-mail appartient à un compte client.");
    const [user] = existing
      ? await tx.update(s.users).set({ passwordHash, isActive: true, name }).where(eq(s.users.id, existing.id)).returning()
      : await tx.insert(s.users).values({ kind: "staff", email, name, passwordHash }).returning();
    await tx.insert(s.userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing();
    await tx.insert(s.auditLogs).values({ userId: user.id, module: "users", action: "create_admin_cli", entityType: "user", entityId: String(user.id), newValues: { email, role: roleKey } });
  });
  await pool.end();
  console.log(`\nCompte prêt : ${email} (${role.name})`);
  console.log(`Mot de passe provisoire : ${password}`);
  console.log("Connectez-vous sur /admin/connexion puis changez ce mot de passe.\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
