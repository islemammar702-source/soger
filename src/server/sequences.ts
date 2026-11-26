import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { documentSequences } from "@/db/schema";

type Tx = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

const PREFIX: Record<string, string> = {
  quote: "DEV", order: "CMD", invoice: "FAC", credit_note: "AV",
  purchase_order: "BCF", goods_receipt: "BR", customer: "CLI", supplier: "FRS", supplier_invoice: "FF",
};
/** Séquences non annuelles (codes clients / fournisseurs). */
const PERPETUAL = new Set(["customer", "supplier"]);

/**
 * Prochain numéro de document, à appeler DANS la transaction du document :
 * la ligne est verrouillée par l'UPDATE, donc pas de doublon ni de trou
 * (si la transaction échoue, le numéro n'est pas consommé).
 */
export async function nextDocumentNumber(tx: Tx, key: keyof typeof PREFIX & string) {
  const year = PERPETUAL.has(key) ? 0 : new Date().getFullYear();
  await tx.insert(documentSequences).values({ key, year, prefix: PREFIX[key] }).onConflictDoNothing();
  const [row] = await tx
    .update(documentSequences)
    .set({ nextValue: sql`${documentSequences.nextValue} + 1` })
    .where(and(eq(documentSequences.key, key), eq(documentSequences.year, year)))
    .returning({ value: sql<number>`${documentSequences.nextValue} - 1`, prefix: documentSequences.prefix });
  const n = String(row.value).padStart(5, "0");
  return year ? `${row.prefix}-${year}-${n}` : `${row.prefix}-${n}`;
}
