import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, parseXlsx, toCsv, toXlsx } from "../src/lib/spreadsheet";

describe("CSV", () => {
  it("détecte le « ; », gère le BOM, les guillemets et les retours à la ligne", () => {
    const s = parseCsv('\uFEFFRéférence;Désignation;Prix\r\nSG-1;"Roulement ""6205""; 2RS";16,5\nSG-2;"Ligne\nmulti";3\n\n');
    assert.deepEqual(s.headers, ["Référence", "Désignation", "Prix"]);
    assert.deepEqual(s.rows, [["SG-1", 'Roulement "6205"; 2RS', "16,5"], ["SG-2", "Ligne\nmulti", "3"]]);
  });

  it("accepte la virgule comme séparateur", () => {
    assert.deepEqual(parseCsv("a,b\n1,2").rows, [["1", "2"]]);
  });

  it("aller-retour toCsv → parseCsv", () => {
    const csv = toCsv(["Réf", "Nom"], [["A;1", 'Dit "x"'], ["B", null]]);
    assert.deepEqual(parseCsv(csv).rows, [["A;1", 'Dit "x"'], ["B", ""]]);
  });
});

describe("Excel (.xlsx) sans dépendance", () => {
  it("aller-retour toXlsx → parseXlsx (accents, nombres, cellules vides)", () => {
    const buf = toXlsx(["Référence", "Désignation", "Prix HT", "Stock"], [["SG-RL-6205", "Roulement à billes « 6205 »", 16.5, 140], ["SG-X", "", 0.125, null]]);
    assert.equal(buf.subarray(0, 2).toString(), "PK");
    const s = parseXlsx(buf);
    assert.deepEqual(s.headers, ["Référence", "Désignation", "Prix HT", "Stock"]);
    assert.deepEqual(s.rows, [["SG-RL-6205", "Roulement à billes « 6205 »", "16.5", "140"], ["SG-X", "", "0.125", ""]]);
  });

  it("refuse un fichier qui n'est pas une archive ZIP", () => {
    assert.throws(() => parseXlsx(Buffer.from("pas un xlsx")), /illisible/);
  });
});
