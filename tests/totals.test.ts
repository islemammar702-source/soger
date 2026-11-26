import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentTotals, lineTotals, round3 } from "../src/lib/totals";

describe("calcul des totaux (millimes)", () => {
  it("arrondit au millime", () => {
    assert.equal(round3(1.0005), 1.001);
    assert.equal(round3(0.1 + 0.2), 0.3);
  });

  it("calcule une ligne avec remise et TVA", () => {
    const l = lineTotals({ quantity: 10, unitPrice: 12.5, discountRate: 5, vatRate: 19 });
    assert.deepEqual(l, { gross: 125, discount: 6.25, net: 118.75, vat: 22.563, total: 141.313 });
  });

  it("ventile la TVA par taux et ajoute livraison + timbre", () => {
    const t = documentTotals(
      [
        { quantity: 2, unitPrice: 100, vatRate: 19 },
        { quantity: 1, unitPrice: 50, vatRate: 7 },
        { quantity: 3, unitPrice: 10, discountRate: 10, vatRate: 19 },
      ],
      { shipping: 5.882, shippingVatRate: 19, stampDuty: 1 },
    );
    assert.equal(t.subtotal, 280);
    assert.equal(t.discountTotal, 3);
    assert.equal(t.netTotal, 277);
    assert.deepEqual(t.vatBreakdown, [
      { rate: 7, base: 50, vat: 3.5 },
      { rate: 19, base: 227, vat: 43.13 },
    ]);
    assert.equal(t.vatTotal, 47.748); // 3,5 + 43,13 + TVA livraison 1,118
    assert.equal(t.total, 331.63); // 277 + 5,882 + 47,748 + 1
  });

  it("cas réel du devis testé de bout en bout", () => {
    const t = documentTotals([
      { quantity: 10, unitPrice: 12.5, discountRate: 5, vatRate: 19 },
      { quantity: 1, unitPrice: 10.5, vatRate: 19 },
    ], { stampDuty: 1 });
    assert.equal(t.total, 154.808);
  });
});
