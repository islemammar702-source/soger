/**
 * Tests d'intégration sur une VRAIE base PostgreSQL, dans une transaction
 * systématiquement annulée (aucune donnée n'est conservée).
 * Lancés uniquement si TEST_DATABASE_URL est défini.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";
import { InsufficientStockError, applyStockMovement } from "../src/server/inventory";
import { nextDocumentNumber } from "../src/server/sequences";
import { cancelOrder, confirmOrder, createOrder, deliverOrder, returnOrderItems } from "../src/server/orders";
import type { Tx } from "../src/server/audit";

const url = process.env.TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url }) : null;
const db = pool ? drizzle({ client: pool, schema: s }) : null;
after(() => pool?.end());

class Rollback extends Error {}
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(
    db!.transaction(async (tx) => {
      await fn(tx as unknown as Tx);
      throw new Rollback();
    }),
    Rollback,
  );
}

async function fixture(tx: Tx) {
  const [w] = await tx.insert(s.warehouses).values({ code: `T${Date.now() % 1e6}`, name: "Dépôt test" }).returning();
  const [p] = await tx.insert(s.products).values({ sku: `TEST-${Date.now()}`, slug: `test-${Date.now()}`, name: "Produit test", salePrice: "10.000", purchasePrice: "6.000", status: "published" }).returning();
  return { w, p };
}

describe("intégration base de données", { skip: !url && "TEST_DATABASE_URL non défini" }, () => {
  it("mouvements de stock : traçabilité, stock après, refus du négatif", () =>
    inRollback(async (tx) => {
      const { w, p } = await fixture(tx);
      const m1 = await applyStockMovement(tx, { productId: p.id, warehouseId: w.id, type: "opening", quantity: 5 });
      assert.equal(Number(m1.quantityAfter), 5);
      const m2 = await applyStockMovement(tx, { productId: p.id, warehouseId: w.id, type: "adjustment", quantity: -3 });
      assert.equal(Number(m2.quantityAfter), 2);
      await assert.rejects(applyStockMovement(tx, { productId: p.id, warehouseId: w.id, type: "sale", quantity: -10 }), InsufficientStockError);
      const moves = await tx.select().from(s.stockMovements).where(eq(s.stockMovements.productId, p.id));
      assert.equal(moves.length, 2);
    }));

  it("numérotation continue des documents", () =>
    inRollback(async (tx) => {
      const a = await nextDocumentNumber(tx, "invoice");
      const b = await nextDocumentNumber(tx, "invoice");
      const n = (x: string) => Number(x.split("-").pop());
      assert.match(a, /^FAC-\d{4}-\d{5}$/);
      assert.equal(n(b), n(a) + 1);
    }));

  it("cycle de commande : réservation, livraison, retour, annulation", () =>
    inRollback(async (tx) => {
      const { w, p } = await fixture(tx);
      await applyStockMovement(tx, { productId: p.id, warehouseId: w.id, type: "opening", quantity: 10 });
      const stockRow = async () => (await tx.select().from(s.stock).where(and(eq(s.stock.productId, p.id), eq(s.stock.warehouseId, w.id))))[0];

      const o = await createOrder(tx, { channel: "online", customer: null, lines: [{ productId: p.id, quantity: 4 }], warehouseId: w.id });
      assert.equal(o.total, "47.600"); // 4 × 10 HT + 19 %
      await confirmOrder(tx, o.id);
      assert.equal(Number((await stockRow()).quantityReserved), 4);
      await deliverOrder(tx, o.id, null);
      let st = await stockRow();
      assert.equal(Number(st.quantityOnHand), 6);
      assert.equal(Number(st.quantityReserved), 0);

      const [item] = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id));
      await assert.rejects(returnOrderItems(tx, o.id, [{ itemId: item.id, quantity: 5 }], null), /supérieur/);
      await returnOrderItems(tx, o.id, [{ itemId: item.id, quantity: 1 }], null);
      assert.equal(Number((await stockRow()).quantityOnHand), 7);

      const o2 = await createOrder(tx, { channel: "online", customer: null, lines: [{ productId: p.id, quantity: 2 }], warehouseId: w.id });
      await confirmOrder(tx, o2.id);
      await cancelOrder(tx, o2.id);
      st = await stockRow();
      assert.equal(Number(st.quantityReserved), 0);
      await assert.rejects(cancelOrder(tx, o.id), /retour/);
    }));
});
