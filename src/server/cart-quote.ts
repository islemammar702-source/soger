"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, quoteItems, quotes } from "@/db/schema";
import { nextDocumentNumber } from "./sequences";

const contact = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().regex(/^[+\d][\d\s.-]{6,19}$/, "Numéro de téléphone invalide"),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide")]).optional(),
  message: z.string().trim().max(3000).optional(),
  website: z.string().max(0).optional(),
});

const items = z
  .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(9999) }))
  .min(1, "Votre panier est vide")
  .max(200);

export type CartQuoteState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; number: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Transforme le panier en demande de devis.
 * Les prix sont relus en base : ceux envoyés par le navigateur sont ignorés.
 */
export async function submitCartQuote(_prev: CartQuoteState, form: FormData): Promise<CartQuoteState> {
  const parsedContact = contact.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== "items")));
  if (!parsedContact.success) {
    return { status: "error", message: "Merci de vérifier les champs indiqués.", fieldErrors: z.flattenError(parsedContact.error).fieldErrors };
  }
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(form.get("items") ?? "[]"));
  } catch {
    rawItems = null;
  }
  const parsedItems = items.safeParse(rawItems);
  if (!parsedItems.success) return { status: "error", message: "Votre panier est vide ou invalide." };

  const d = parsedContact.data;
  if (d.website) return { status: "success", number: "—" };

  // Fusionne les doublons éventuels.
  const qtyById = new Map<number, number>();
  for (const i of parsedItems.data) qtyById.set(i.productId, Math.min(9999, (qtyById.get(i.productId) ?? 0) + i.quantity));

  try {
    const number = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: products.id, sku: products.sku, name: products.name, price: products.salePrice, vat: products.vatRate })
        .from(products)
        .where(and(inArray(products.id, [...qtyById.keys()]), eq(products.status, "published"), eq(products.isActive, true)));
      if (!rows.length) throw new EmptyCartError();

      const lines = rows.map((p, i) => {
        const quantity = qtyById.get(p.id)!;
        const unit = Number(p.price ?? 0);
        const lineTotal = r3(unit * quantity);
        return { p, quantity, unit, lineTotal, vat: r3((lineTotal * Number(p.vat)) / 100), sortOrder: i };
      });
      const subtotal = r3(lines.reduce((s, l) => s + l.lineTotal, 0));
      const vatTotal = r3(lines.reduce((s, l) => s + l.vat, 0));

      const num = await nextDocumentNumber(tx, "quote");
      const [quote] = await tx
        .insert(quotes)
        .values({
          number: num,
          source: "web_cart",
          status: "draft",
          contactName: d.name,
          companyName: d.company || null,
          contactPhone: d.phone,
          contactEmail: d.email || null,
          subtotal: subtotal.toFixed(3),
          vatTotal: vatTotal.toFixed(3),
          total: r3(subtotal + vatTotal).toFixed(3),
          notes: d.message || null,
        })
        .returning({ id: quotes.id });

      await tx.insert(quoteItems).values(
        lines.map((l) => ({
          quoteId: quote.id,
          productId: l.p.id,
          sku: l.p.sku,
          description: l.p.name,
          quantity: String(l.quantity),
          unitPrice: l.unit.toFixed(3),
          vatRate: l.p.vat,
          lineTotal: l.lineTotal.toFixed(3),
          sortOrder: l.sortOrder,
        })),
      );
      return num;
    });
    return { status: "success", number };
  } catch (e) {
    if (e instanceof EmptyCartError) return { status: "error", message: "Les produits de votre panier ne sont plus disponibles." };
    console.error("submitCartQuote", e);
    return { status: "error", message: "Une erreur est survenue. Réessayez ou contactez-nous par téléphone." };
  }
}

class EmptyCartError extends Error {}
