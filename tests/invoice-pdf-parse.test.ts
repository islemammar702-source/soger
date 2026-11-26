/** Lecture « sans IA » des factures PDF contenant du texte (fichiers de test dans tests/fixtures). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extractTextItems } from "unpdf";
import { parseAmount, parseDate, parseInvoiceText } from "../src/lib/invoice-pdf-parse";

async function read(name: string) {
  const r = await extractTextItems(new Uint8Array(readFileSync(`tests/fixtures/${name}.pdf`)));
  return parseInvoiceText(r.items.map((p) => p.map((i) => ({ str: i.str, x: i.x, y: i.y, width: i.width, fontSize: i.fontSize }))))!;
}

describe("montants et dates au format tunisien", () => {
  it("lit les montants", () => {
    assert.equal(parseAmount("1 234,500"), 1234.5);
    assert.equal(parseAmount("1.234,500"), 1234.5);
    assert.equal(parseAmount("12.500"), 12.5);
    assert.equal(parseAmount("-131,675"), -131.675);
    assert.equal(parseAmount("2 978,172 DT"), 2978.172);
    assert.equal(parseAmount("19 %"), 19);
    assert.equal(parseAmount("SKF-6205"), null);
  });
  it("lit les dates", () => {
    assert.equal(parseDate("Date : 26/11/2026"), "2026-11-26");
    assert.equal(parseDate("20.11.2026"), "2026-11-20");
    assert.equal(parseDate("5-1-26"), "2026-01-05");
    assert.equal(parseDate("45/13/2026"), null);
  });
});

describe("facture PDF au format SOGER (remise globale, TVA unique)", () => {
  it("remplit en-tête, lignes et totaux", async () => {
    const d = await read("facture-soger");
    assert.equal(d.invoiceNumber, "FA-2026-0001");
    assert.equal(d.issueDate, "2026-11-26");
    assert.equal(d.dueDate, "2026-12-26");
    assert.equal(d.supplier.name, "SOGER SARL");
    assert.equal(d.supplier.taxId, "1234567A/M/000", "matricule de l'émetteur, pas celui du client");
    assert.equal(d.lines.length, 5);
    assert.deepEqual(
      d.lines.map((l) => [l.reference, l.quantity, l.unitPriceHT, l.discountRate, l.vatRate, l.lineTotalHT]),
      [["SKF-6205-2RS", 25, 18.5, 5, 19, 462.5], ["SKF-22210E", 4, 245, 5, 19, 980], ["UCP-208", 6, 62.75, 5, 19, 376.5], ["KTR-ROTEX-38", 2, 310, 5, 19, 620], ["GR-LGMT2-1", 5, 38.9, 5, 19, 194.5]],
    );
    assert.deepEqual(d.totals, { totalHT: 2501.825, totalVAT: 475.347, stampDuty: 1, totalTTC: 2978.172 });
    assert.equal(d.paymentMethod, "transfer");
  });
});

describe("facture PDF fournisseur (colonnes remise et TVA, désignation sur deux lignes)", () => {
  it("remplit en-tête, lignes et totaux", async () => {
    const d = await read("facture-fournisseur");
    assert.equal(d.supplier.name, "ROULEMENTS IMPORT SARL");
    assert.equal(d.supplier.taxId, "0987654Z/A/M/000");
    assert.equal(d.supplier.address, "Z.I. Poudrière 2, 3002 Sfax");
    assert.equal(d.invoiceNumber, "RI/2026/0457");
    assert.equal(d.issueDate, "2026-11-20");
    assert.equal(d.dueDate, "2026-12-20");
    assert.deepEqual(
      d.lines.map((l) => [l.reference, l.description, l.quantity, l.unitPriceHT, l.discountRate, l.vatRate]),
      [["6205 2RSH", "Roulement 6205-2RSH", 10, 12.5, 10, 19], ["UCF206", "Palier UCF 206", 3, 25, null, 19], [null, "Frais de transport (livraison express)", 1, 20, null, 7]],
    );
    assert.equal(d.totals.totalTTC, 245.525);
    assert.equal(d.totals.totalVAT, 37.025);
  });
});
