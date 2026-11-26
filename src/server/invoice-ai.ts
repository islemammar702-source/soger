import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

/**
 * Lecture automatique d'une facture fournisseur (PDF ou photo) avec Claude.
 * Le résultat n'est JAMAIS enregistré tel quel : il préremplit un formulaire
 * que l'administrateur vérifie, corrige puis confirme.
 */

export const ExtractedInvoice = z.object({
  supplier: z.object({
    name: z.string().nullable().describe("Raison sociale du fournisseur (émetteur de la facture), pas SOGER."),
    taxId: z.string().nullable().describe("Matricule fiscal du fournisseur, tel qu'imprimé."),
    address: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  invoiceNumber: z.string().nullable().describe("Numéro de la facture du fournisseur."),
  issueDate: z.string().nullable().describe("Date de facture au format AAAA-MM-JJ."),
  dueDate: z.string().nullable().describe("Date d'échéance au format AAAA-MM-JJ, si imprimée."),
  documentType: z.enum(["invoice", "credit_note", "proforma", "delivery_note", "other"]).describe("Nature du document."),
  lines: z.array(
    z.object({
      reference: z.string().nullable().describe("Référence article imprimée sur la ligne (code fournisseur ou fabricant)."),
      manufacturerRef: z.string().nullable().describe("Référence fabricant si elle est distincte de la référence ci-dessus."),
      brand: z.string().nullable(),
      description: z.string().describe("Désignation de l'article."),
      quantity: z.number().nullable(),
      unitPriceHT: z.number().nullable().describe("Prix unitaire hors taxes, avant remise."),
      discountRate: z.number().nullable().describe("Remise en pourcentage (ex. 10 pour 10 %)."),
      vatRate: z.number().nullable().describe("Taux de TVA en pourcentage (ex. 19, 13, 7 ou 0)."),
      lineTotalHT: z.number().nullable().describe("Montant HT de la ligne, après remise."),
    }),
  ),
  totals: z.object({
    totalHT: z.number().nullable(),
    totalVAT: z.number().nullable(),
    stampDuty: z.number().nullable().describe("Droit de timbre (ex. 1.000 DT)."),
    totalTTC: z.number().nullable(),
  }),
  amountPaid: z.number().nullable().describe("Montant déjà réglé indiqué sur la facture (acompte, « payé »), sinon null."),
  paymentMethod: z.enum(["cash", "card", "transfer", "check", "other"]).nullable(),
  warnings: z.array(z.string()).describe("Éléments illisibles, incertains ou incohérents, en français."),
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoice>;

const PROMPT = `Tu lis une facture d'achat reçue par SOGER, distributeur tunisien de pièces industrielles et agricoles.
SOGER est le CLIENT sur ce document : le fournisseur est l'émetteur (en-tête, cachet, matricule fiscal de l'émetteur).

Recopie fidèlement ce qui est imprimé, sans rien inventer :
- Montants en dinars tunisiens, 3 décimales. Convertis « 1.234,500 » ou « 1 234,500 » en 1234.5.
- Dates au format AAAA-MM-JJ (les factures tunisiennes écrivent JJ/MM/AAAA).
- Une ligne par article facturé, dans l'ordre du document. N'invente ni ligne, ni référence, ni prix.
- Si une valeur est absente ou illisible, mets null et explique-le dans « warnings ».
- Si le total calculé des lignes ne correspond pas au total imprimé, signale-le dans « warnings ».
- Les frais de transport ou de service facturés sont des lignes comme les autres.`;

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export class ExtractionError extends Error {}

/** Envoie le document à Claude et renvoie les données structurées (validées par le schéma). */
export async function extractInvoice(file: { data: Buffer; mimeType: string }): Promise<ExtractedInvoice> {
  if (!aiEnabled()) throw new ExtractionError("La reconnaissance automatique n'est pas configurée (clé ANTHROPIC_API_KEY absente).");
  const client = new Anthropic({ timeout: 180_000, maxRetries: 2 });

  let block: Anthropic.Beta.BetaContentBlockParam;
  if (file.mimeType === "application/pdf") {
    block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data.toString("base64") } };
  } else {
    // Photo : redimensionnée (2000 px max) pour rester sous la limite d'image de l'API et accélérer la lecture.
    let data = file.data;
    let mediaType: "image/jpeg" | "image/png" = file.mimeType === "image/png" ? "image/png" : "image/jpeg";
    try {
      const sharp = (await import("sharp")).default;
      data = await sharp(file.data).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      mediaType = "image/jpeg";
    } catch {
      /* bibliothèque d'image indisponible : on envoie l'original */
    }
    block = { type: "image", source: { type: "base64", media_type: mediaType, data: data.toString("base64") } };
  }

  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractedInvoice) },
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ExtractionError("Clé ANTHROPIC_API_KEY refusée : vérifiez-la dans le fichier .env.");
    if (e instanceof Anthropic.RateLimitError) throw new ExtractionError("Service de reconnaissance momentanément saturé : réessayez dans une minute.");
    if (e instanceof Anthropic.BadRequestError) throw new ExtractionError("Document refusé par le service de reconnaissance (fichier trop lourd ou illisible).");
    if (e instanceof Anthropic.APIConnectionError) throw new ExtractionError("Service de reconnaissance injoignable : vérifiez la connexion Internet.");
    if (e instanceof Anthropic.APIError) throw new ExtractionError(`Erreur du service de reconnaissance (${e.status ?? "réseau"}).`);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new ExtractionError("Le document n'a pas pu être analysé automatiquement. Saisissez la facture manuellement.");
  if (response.stop_reason === "max_tokens") throw new ExtractionError("Facture trop longue pour une lecture automatique complète. Saisissez-la manuellement ou importez-la en plusieurs parties.");
  if (!response.parsed_output) throw new ExtractionError("Lecture automatique incomplète. Saisissez ou complétez la facture manuellement.");
  return response.parsed_output;
}
