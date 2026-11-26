import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Liens signés vers les documents (devis, facture) : un client sans compte peut
 * ouvrir son devis, mais personne ne peut deviner le lien d'un autre document.
 * Secret : APP_SECRET (recommandé), à défaut dérivé de DATABASE_URL.
 */
function secret() {
  const s = process.env.APP_SECRET || createHash("sha256").update(`soger:${process.env.DATABASE_URL ?? ""}`).digest("hex");
  return s;
}

export function signDocument(kind: "devis" | "facture", id: number) {
  return createHmac("sha256", secret()).update(`${kind}:${id}`).digest("base64url").slice(0, 32);
}

export function verifyDocument(kind: "devis" | "facture", id: number, token: string | undefined | null) {
  if (!token) return false;
  const expected = Buffer.from(signDocument(kind, id));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function documentUrl(kind: "devis" | "facture", id: number) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/documents/${kind}/${id}?t=${signDocument(kind, id)}`;
}

/** Numéro WhatsApp tunisien normalisé (8 chiffres → 216XXXXXXXX). */
export function whatsappTo(phone: string | null | undefined, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const n = digits.length === 8 ? `216${digits}` : digits.replace(/^00/, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/**
 * Envoi d'e-mail via l'API Resend si RESEND_API_KEY et MAIL_FROM sont définis.
 * Sans configuration, renvoie { sent: false } : l'interface propose alors WhatsApp ou le lien.
 */
export async function sendMail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return { sent: false as const, reason: "Envoi d'e-mails non configuré (RESEND_API_KEY / MAIL_FROM)." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return res.ok ? { sent: true as const } : { sent: false as const, reason: `Le service d'e-mail a répondu ${res.status}.` };
}
