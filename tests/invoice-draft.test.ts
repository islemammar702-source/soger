/**
 * Facture fournisseur importée : transformation des données lues en brouillon
 * (rapprochement fournisseur / produits, contrôles). Lecture seule sur la base de test.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedInvoice } from "../src/server/invoice-ai";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const sample = (over: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  supplier: { name: "Roulements Import S.A.R.L", taxId: null, address: "Zone industrielle, Sfax", phone: null },
  invoiceNumber: "FA-2026/0457",
  issueDate: "2026-11-20",
  dueDate: "31/12/2026",
  documentType: "invoice",
  lines: [
    { reference: "6205 2RSH", manufacturerRef: null, brand: "SKF", description: "Roulement 6205-2RSH", quantity: 10, unitPriceHT: 12.5, discountRate: 10, vatRate: 19, lineTotalHT: 112.5 },
    { reference: null, manufacturerRef: null, brand: null, description: "Roulement à billes 6205-2RS FAG", quantity: 4, unitPriceHT: null, discountRate: null, vatRate: 13, lineTotalHT: 40 },
    { reference: "XYZ-999", manufacturerRef: null, brand: null, description: "Article totalement inconnu du catalogue", quantity: null, unitPriceHT: 3, discountRate: null, vatRate: 21, lineTotalHT: null },
  ],
  totals: { totalHT: 152.5, totalVAT: 26.58, stampDuty: 1, totalTTC: 180.08 },
  amountPaid: null,
  paymentMethod: "check",
  warnings: ["Cachet partiellement illisible."],
  ...over,
});

describe("facture importée → brouillon à vérifier", { skip: !url && "TEST_DATABASE_URL non défini" }, () => {
  it("rapproche le fournisseur par son nom et les produits par référence normalisée puis par désignation", async () => {
    const { buildDraft } = await import("../src/server/admin/supplier-invoice-match");
    const d = await buildDraft(sample());
    assert.equal(d.supplier.how, "name");
    assert.equal(d.supplier.name, "Roulements Import SARL");
    assert.equal(d.externalRef, "FA-2026/0457");
    assert.equal(d.issueDate, "2026-11-20");
    assert.equal(d.dueDate, "", "date non ISO ignorée plutôt qu'inventée");
    // Ligne 1 : « 6205 2RSH » = réf. fabricant « 6205-2RSH » → exact
    assert.equal(d.lines[0].match, "exact");
    assert.equal(d.lines[0].sku, "SG-RL-6205-2RS");
    assert.equal(d.lines[0].supplierRef, "6205 2RSH");
    // Ligne 2 : pas de référence, désignation proche → probable ; prix unitaire déduit du total
    assert.equal(d.lines[1].match, "probable");
    assert.equal(d.lines[1].sku, "SG-RL-6205-2RS-F");
    assert.equal(d.lines[1].unitPrice, 10);
    assert.ok(d.warnings.some((w) => w.includes("Ligne 2") && w.includes("déduit")));
    // Ligne 3 : inconnue → non associée, quantité par défaut 1, TVA invalide → taux par défaut
    assert.equal(d.lines[2].productId, null);
    assert.equal(d.lines[2].quantity, 1);
    assert.equal(d.lines[2].vatRate, 19);
    assert.equal(d.lines[2].manufacturerRef, "XYZ-999");
    assert.equal(d.stampDuty, 1);
    assert.equal(d.paymentMethod, "check");
    assert.ok(d.warnings.includes("Cachet partiellement illisible."));
  });

  it("signale un document qui n'est pas une facture et un fournisseur inconnu", async () => {
    const { buildDraft } = await import("../src/server/admin/supplier-invoice-match");
    const d = await buildDraft(sample({ documentType: "delivery_note", supplier: { name: "Société Totalement Inconnue", taxId: "9999999Z/A/M/000", address: null, phone: null }, lines: [] }));
    assert.equal(d.supplier.id, null);
    assert.equal(d.supplier.name, "Société Totalement Inconnue");
    assert.match(d.warnings[0], /ne semble pas être une facture/);
  });
});
