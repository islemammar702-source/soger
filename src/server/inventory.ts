import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { stock, stockMovements } from "@/db/schema";

type Tx = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export type StockMovementInput = {
  productId: number;
  warehouseId: number;
  type: (typeof stockMovements.$inferInsert)["type"];
  /** Positif = entrée, négatif = sortie. */
  quantity: number | string;
  unitCost?: string | null;
  referenceType?: string;
  referenceId?: number;
  transferGroup?: string;
  note?: string;
  userId?: number | null;
  /** Autoriser un stock négatif (désactivé par défaut). */
  allowNegative?: boolean;
};

export class InsufficientStockError extends Error {
  constructor(public productId: number, public available: string) {
    super(`Stock insuffisant pour le produit ${productId} (disponible : ${available})`);
  }
}

/**
 * SEUL point d'entrée pour modifier une quantité en stock.
 * Doit être appelé à l'intérieur d'une transaction (`db.transaction(tx => …)`) :
 * la ligne de stock est verrouillée (FOR UPDATE), mise à jour, puis le
 * mouvement est enregistré avec la quantité résultante.
 */
export async function applyStockMovement(tx: Tx, input: StockMovementInput) {
  const delta = String(input.quantity);
  if (Number(delta) === 0) throw new Error("Quantité de mouvement nulle");

  await tx
    .insert(stock)
    .values({ productId: input.productId, warehouseId: input.warehouseId })
    .onConflictDoNothing();

  const [current] = await tx
    .select({ onHand: stock.quantityOnHand })
    .from(stock)
    .where(and(eq(stock.productId, input.productId), eq(stock.warehouseId, input.warehouseId)))
    .for("update");

  const after = Number(current.onHand) + Number(delta);
  if (after < 0 && !input.allowNegative) {
    throw new InsufficientStockError(input.productId, current.onHand);
  }

  const [updated] = await tx
    .update(stock)
    .set({
      quantityOnHand: sql`${stock.quantityOnHand} + ${delta}::numeric`,
      updatedAt: new Date(),
    })
    .where(and(eq(stock.productId, input.productId), eq(stock.warehouseId, input.warehouseId)))
    .returning({ onHand: stock.quantityOnHand });

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: delta,
      quantityAfter: updated.onHand,
      unitCost: input.unitCost ?? null,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      transferGroup: input.transferGroup,
      note: input.note,
      userId: input.userId ?? null,
    })
    .returning();

  return movement;
}
