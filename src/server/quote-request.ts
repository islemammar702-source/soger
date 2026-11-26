"use server";

import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, quoteItems, quotes } from "@/db/schema";
import { nextDocumentNumber } from "./sequences";

const schema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().regex(/^[+\d][\d\s.-]{6,19}$/, "Numéro de téléphone invalide"),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide")]).optional(),
  references: z.string().trim().max(500).optional(),
  message: z.string().trim().min(5, "Décrivez votre besoin").max(3000),
  // Champ piège anti-robot : doit rester vide.
  website: z.string().max(0).optional(),
});

export type QuoteRequestState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; number: string };

export async function submitQuoteRequest(_prev: QuoteRequestState, form: FormData): Promise<QuoteRequestState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Merci de vérifier les champs indiqués.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const d = parsed.data;
  if (d.website) return { status: "success", number: "—" };

  // Références saisies (« 6205-2RS, SG-CR-B68 ») → lignes de devis si elles existent.
  const refs = (d.references ?? "")
    .split(/[\s,;]+/)
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 30);

  try {
    const number = await db.transaction(async (tx) => {
      const found = refs.length
        ? await tx
            .select({ id: products.id, sku: products.sku, name: products.name, mref: products.manufacturerRef, price: products.salePrice, vat: products.vatRate })
            .from(products)
            .where(inArray(products.sku, refs))
        : [];

      // Quantité 1 par défaut : le commercial ajuste avant l'envoi.
      const subtotal = found.reduce((s, p) => s + Number(p.price ?? 0), 0);
      const vatTotal = found.reduce((s, p) => s + Number(p.price ?? 0) * (Number(p.vat) / 100), 0);

      const num = await nextDocumentNumber(tx, "quote");
      const [quote] = await tx
        .insert(quotes)
        .values({
          number: num,
          source: "web",
          status: "draft",
          subtotal: subtotal.toFixed(3),
          vatTotal: vatTotal.toFixed(3),
          total: (subtotal + vatTotal).toFixed(3),
          contactName: d.name,
          companyName: d.company || null,
          contactPhone: d.phone,
          contactEmail: d.email || null,
          notes: [d.message, refs.length ? `Références citées : ${refs.join(", ")}` : null].filter(Boolean).join("\n\n"),
        })
        .returning({ id: quotes.id });

      if (found.length) {
        await tx.insert(quoteItems).values(
          found.map((p, i) => ({
            quoteId: quote.id,
            productId: p.id,
            sku: p.sku,
            description: p.name,
            quantity: "1",
            unitPrice: p.price ?? "0",
            vatRate: p.vat,
            lineTotal: p.price ?? "0",
            sortOrder: i,
          })),
        );
      }
      return num;
    });
    // TODO (phase 11) : notifier l'équipe commerciale (e-mail / notification back-office).
    return { status: "success", number };
  } catch (e) {
    console.error("submitQuoteRequest", e);
    return { status: "error", message: "Une erreur est survenue. Réessayez ou contactez-nous par téléphone." };
  }
}
