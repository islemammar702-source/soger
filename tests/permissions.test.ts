import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_PERMISSIONS, ROLE_DEFINITIONS } from "../src/lib/permissions";
import { ADMIN_NAV } from "../src/components/admin/nav-config";

describe("matrice des permissions", () => {
  const role = (k: string) => ROLE_DEFINITIONS.find((r) => r.key === k)!;

  it("chaque permission de rôle existe", () => {
    for (const r of ROLE_DEFINITIONS) for (const p of r.permissions) assert.ok(ALL_PERMISSIONS.includes(p), `${r.key} → ${p}`);
  });

  it("le super administrateur a tout, l'administrateur ne touche pas aux paramètres système", () => {
    assert.equal(role("super_admin").permissions.length, ALL_PERMISSIONS.length);
    assert.ok(!role("admin").permissions.includes("settings.update"));
  });

  it("séparation des tâches", () => {
    assert.ok(!role("storekeeper").permissions.includes("products.create"));
    assert.ok(!role("storekeeper").permissions.includes("invoices.view"));
    assert.ok(!role("sales").permissions.includes("pos.refund"));
    assert.ok(!role("sales").permissions.includes("products.view_cost"));
    assert.ok(role("accountant").permissions.includes("invoices.cancel"));
  });

  it("chaque entrée du menu exige une permission existante", () => {
    for (const item of ADMIN_NAV.flatMap((g) => g.items)) assert.ok(ALL_PERMISSIONS.includes(item.permission), item.href);
  });
});
