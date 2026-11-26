import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

/** Hachage scrypt (natif Node.js) : `scrypt$N$r$p$sel$empreinte`. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  // Calcul effectué même sans mot de passe stocké : même durée de réponse (anti-énumération).
  const parts = (stored ?? "").split("$");
  const valid = parts.length === 6 && parts[0] === "scrypt";
  const [N, r, p] = valid ? parts.slice(1, 4).map(Number) : [PARAMS.N, PARAMS.r, PARAMS.p];
  const salt = valid ? Buffer.from(parts[4], "base64url") : randomBytes(16);
  const expected = valid ? Buffer.from(parts[5], "base64url") : randomBytes(KEYLEN);
  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, { N, r, p, maxmem: PARAMS.maxmem });
  return valid && timingSafeEqual(actual, expected);
}

/** Règle minimale : 10 caractères dont au moins une lettre et un chiffre. */
export function passwordProblem(password: string) {
  if (password.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Le mot de passe doit contenir des lettres et des chiffres.";
  if (password.length > 200) return "Mot de passe trop long.";
  return null;
}
