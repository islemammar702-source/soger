import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeFilterCount, parseCatalogParams, parseRange } from "../src/lib/catalog-params";
import { suggestMapping } from "../src/lib/import-fields";

describe("paramètres d'URL du catalogue", () => {
  it("lit les plages, avec virgule décimale et bornes ouvertes", () => {
    assert.deepEqual(parseRange("20-30"), [20, 30]);
    assert.deepEqual(parseRange("-12,5"), [null, 12.5]);
    assert.equal(parseRange("abc-"), null);
  });

  it("filtre les valeurs non sûres et borne la pagination", () => {
    const { filters, view } = parseCatalogParams({ q: "  6205 ", marque: "skf,FAG,<script>", prix: "10-50", stock: "1", tri: "drop table", page: "999999", vue: "liste", f_inner_diameter: "20-30", "f_bad key": "1-2" });
    assert.equal(filters.q, "6205");
    assert.deepEqual(filters.brands, ["skf", "fag"]);
    assert.equal(filters.priceMin, 10);
    assert.equal(filters.priceMax, 50);
    assert.equal(filters.inStock, true);
    assert.equal(filters.sort, undefined);
    assert.equal(filters.page, 10000);
    assert.deepEqual(filters.attrs, { inner_diameter: [20, 30] });
    assert.equal(view, "liste");
    assert.equal(activeFilterCount(filters), 4);
  });
});

describe("import : correspondance automatique des colonnes", () => {
  it("reconnaît les en-têtes usuels (accents, casse)", () => {
    const m = suggestMapping(["Référence", "DÉSIGNATION", "Prix de vente", "Qté", "TVA", "Colonne inconnue"]);
    assert.deepEqual(m, { "Référence": "sku", "DÉSIGNATION": "name", "Prix de vente": "salePrice", "Qté": "stock", "TVA": "vatRate", "Colonne inconnue": "" });
  });
});
