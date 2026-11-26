"use server";

import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { brands, categories, products, stock } from "@/db/schema";
import { IMPORT_FIELDS, suggestMapping, type ImportFieldKey } from "@/lib/import-fields";
import { readSpreadsheet } from "@/lib/spreadsheet";
import { slugify } from "@/lib/utils";
import { audit } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { applyStockMovement } from "../inventory";
import { defaultWarehouseId } from "../orders";

export type PreviewState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; headers: string[]; sample: string[][]; total: number; mapping: Record<string, string> };

export type ImportReport = {
  status: "idle" | "error" | "done";
  message?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  stockMoves?: number;
  errors?: { line: number; sku: string; message: string }[];
};

const MAX_ROWS = 20_000;
const BATCH = 250;

export async function previewImportAction(_: PreviewState, form: FormData): Promise<PreviewState> {
  try {
    await assertStaff("products.import");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return { status: "error", message: "Choisissez un fichier CSV ou Excel (.xlsx)." };
    const sheet = await readSpreadsheet(file);
    if (!sheet.headers.length) return { status: "error", message: "Le fichier ne contient pas de ligne d'en-tête." };
    return { status: "ready", headers: sheet.headers, sample: sheet.rows.slice(0, 8), total: sheet.rows.length, mapping: suggestMapping(sheet.headers) };
  } catch (e) {
    return { status: "error", message: e instanceof AccessDenied ? e.message : e instanceof Error ? e.message : "Lecture impossible." };
  }
}

const num = (v: string) => {
  const s = v.replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export async function runImportAction(_: ImportReport, form: FormData): Promise<ImportReport> {
  let me;
  try {
    me = await assertStaff("products.import");
  } catch (e) {
    return { status: "error", message: e instanceof AccessDenied ? e.message : "Accès refusé" };
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { status: "error", message: "Fichier manquant." };
  const mode = z.enum(["upsert", "create", "update"]).catch("upsert").parse(form.get("mode"));
  const createRefs = form.get("createRefs") === "on";
  const canPublish = me.can("products.publish");
  // Case « Publier directement » : uniquement pour les nouveaux produits sans colonne Statut.
  const publish = form.get("publish") === "on" && canPublish;
  const canStock = me.can("stock.adjust");
  let mapping: Record<string, ImportFieldKey | "">;
  try {
    mapping = JSON.parse(String(form.get("mapping") ?? "{}"));
  } catch {
    return { status: "error", message: "Correspondance des colonnes invalide." };
  }
  const sheet = await readSpreadsheet(file);
  if (sheet.rows.length > MAX_ROWS) return { status: "error", message: `Trop de lignes (${sheet.rows.length}). Maximum ${MAX_ROWS} par import.` };
  const col = new Map<ImportFieldKey, number>();
  sheet.headers.forEach((h, i) => {
    const k = mapping[h];
    if (k && IMPORT_FIELDS.some((f) => f.key === k)) col.set(k, i);
  });
  if (!col.has("sku")) return { status: "error", message: "La colonne « Référence SOGER » est obligatoire." };
  const get = (row: string[], k: ImportFieldKey) => (col.has(k) ? (row[col.get(k)!] ?? "").trim() : undefined);

  const report: Required<ImportReport> = { status: "done", message: "", created: 0, updated: 0, skipped: 0, stockMoves: 0, errors: [] };
  const fail = (line: number, sku: string, message: string) => {
    if (report.errors.length < 500) report.errors.push({ line, sku, message });
    report.skipped++;
  };

  // Référentiels (insensible à la casse et aux accents).
  const key = (s: string) => slugify(s);
  const brandMap = new Map((await db.select({ id: brands.id, name: brands.name, slug: brands.slug }).from(brands)).flatMap((b) => [[key(b.name), b.id], [b.slug, b.id]] as const));
  const catMap = new Map((await db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories)).flatMap((c) => [[key(c.name), c.id], [c.slug, c.id]] as const));
  const warehouseId = await defaultWarehouseId(db as never);

  // Doublons dans le fichier.
  const seen = new Map<string, number>();
  const rows = sheet.rows.map((r, i) => ({ r, line: i + 2 })).filter(({ r, line }) => {
    const sku = (get(r, "sku") ?? "").toUpperCase();
    if (!sku) {
      fail(line, "", "Référence vide");
      return false;
    }
    if (seen.has(sku)) {
      fail(line, sku, `Doublon dans le fichier (déjà ligne ${seen.get(sku)})`);
      return false;
    }
    seen.set(sku, line);
    return true;
  });

  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);
    const skus = chunk.map(({ r }) => get(r, "sku")!.toUpperCase());
    const local = { created: 0, updated: 0, stockMoves: 0, skipped: 0, errors: [] as { line: number; sku: string; message: string }[] };
    try {
      await db.transaction(async (tx) => {
        const fail = (line: number, sku: string, message: string) => {
          local.errors.push({ line, sku, message });
          local.skipped++;
        };
        const existing = new Map((await tx.select({ id: products.id, sku: products.sku }).from(products).where(inArray(products.sku, skus))).map((p) => [p.sku, p.id]));
        for (const { r, line } of chunk) {
          const sku = get(r, "sku")!.toUpperCase();
          const id = existing.get(sku);
          if (id && mode === "create") { fail(line, sku, "Existe déjà (mode « création seulement »)"); continue; }
          if (!id && mode === "update") { fail(line, sku, "Référence inconnue (mode « mise à jour seulement »)"); continue; }
          if (!/^[A-Z0-9._\-/ ]{2,60}$/.test(sku)) { fail(line, sku, "Référence invalide (2–60 caractères : lettres, chiffres, - _ . /)"); continue; }

          const values: Partial<typeof products.$inferInsert> = {};
          const name = get(r, "name");
          if (name !== undefined && name !== "") values.name = name.slice(0, 200);
          if (!id && !values.name) { fail(line, sku, "Désignation obligatoire pour créer un produit"); continue; }
          for (const k of ["manufacturerRef", "barcode", "unit", "shortDescription", "description"] as const) {
            const v = get(r, k);
            if (v !== undefined && v !== "") values[k] = v.slice(0, k === "description" ? 10000 : 300);
          }
          let bad = "";
          for (const k of ["purchasePrice", "salePrice", "proPrice"] as const) {
            const v = get(r, k);
            if (v === undefined || v === "") continue;
            const n = num(v);
            if (n === null || Number.isNaN(n)) bad = `Prix invalide (${v})`;
            else values[k] = n.toFixed(3);
          }
          const vat = get(r, "vatRate");
          if (vat) {
            const n = num(vat.replace("%", ""));
            if (n === null || Number.isNaN(n) || ![0, 7, 13, 19].includes(n)) bad = `TVA invalide (${vat}) : 0, 7, 13 ou 19`;
            else values.vatRate = n.toFixed(2);
          }
          const min = get(r, "minStock");
          if (min) {
            const n = num(min);
            if (n === null || Number.isNaN(n)) bad = `Stock minimum invalide (${min})`;
            else values.minStock = String(n);
          }
          if (bad) { fail(line, sku, bad); continue; }

          const brandName = get(r, "brand");
          if (brandName) {
            let bid = brandMap.get(key(brandName));
            if (!bid && createRefs) {
              const [b] = await tx.insert(brands).values({ name: brandName.slice(0, 80), slug: key(brandName) }).onConflictDoNothing().returning({ id: brands.id });
              bid = b?.id ?? (await tx.select({ id: brands.id }).from(brands).where(eq(brands.slug, key(brandName))))[0]?.id;
              if (bid) brandMap.set(key(brandName), bid);
            }
            if (!bid) { fail(line, sku, `Marque inconnue « ${brandName} » (cochez « créer les marques et catégories manquantes »)`); continue; }
            values.brandId = bid;
          }
          const catName = get(r, "category");
          if (catName) {
            let cid = catMap.get(key(catName));
            if (!cid && createRefs) {
              const [c] = await tx.insert(categories).values({ name: catName.slice(0, 80), slug: key(catName), sector: "industrial" }).onConflictDoNothing().returning({ id: categories.id });
              cid = c?.id ?? (await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, key(catName))))[0]?.id;
              if (cid) catMap.set(key(catName), cid);
            }
            if (!cid) { fail(line, sku, `Catégorie inconnue « ${catName} »`); continue; }
            values.categoryId = cid;
          }
          const status = get(r, "status");
          if (status) {
            const wanted = /^(publi|oui|1|yes|published|en ligne)/i.test(status) ? "published" : /^archiv/i.test(status) ? "archived" : "draft";
            // La colonne Statut fait foi pour qui a le droit de publier. Sans ce droit, le statut
            // d'un produit existant n'est jamais modifié (un ré-import ne dépublie pas le catalogue).
            if (canPublish) values.status = wanted;
            else if (!id) values.status = wanted === "published" ? "draft" : wanted;
          }

          let pid = id;
          if (id) {
            if (Object.keys(values).length) await tx.update(products).set(values).where(eq(products.id, id));
            local.updated++;
          } else {
            const slug = slugify(`${values.name}-${sku}`).slice(0, 200);
            const [created] = await tx
              .insert(products)
              .values({ ...values, sku, name: values.name!, slug, status: values.status ?? (publish ? "published" : "draft") })
              .returning({ id: products.id });
            pid = created.id;
            local.created++;
          }

          const qtyRaw = get(r, "stock");
          if (qtyRaw && pid) {
            const target = num(qtyRaw);
            if (target === null || Number.isNaN(target)) { local.errors.push({ line, sku, message: `Stock ignoré : quantité invalide (${qtyRaw})` }); continue; }
            if (!canStock) { local.errors.push({ line, sku, message: "Stock ignoré : permission « stock.adjust » requise" }); continue; }
            await tx.insert(stock).values({ productId: pid, warehouseId }).onConflictDoNothing();
            const [cur] = await tx.select({ q: stock.quantityOnHand }).from(stock).where(and(eq(stock.productId, pid), eq(stock.warehouseId, warehouseId)));
            const delta = Math.round((target - Number(cur.q)) * 1000) / 1000;
            if (delta !== 0) {
              await applyStockMovement(tx, { productId: pid, warehouseId, type: "inventory", quantity: delta, note: `Import ${file.name}`, referenceType: "import", userId: me.id, allowNegative: true });
              local.stockMoves++;
            }
          }
        }
      });
      report.created += local.created;
      report.updated += local.updated;
      report.stockMoves += local.stockMoves;
      report.skipped += local.skipped;
      report.errors.push(...local.errors.slice(0, Math.max(0, 500 - report.errors.length)));
    } catch (e) {
      console.error("import batch", e);
      for (const { r, line } of chunk) fail(line, get(r, "sku") ?? "", "Lot annulé (erreur base de données) — aucune ligne de ce lot n'a été enregistrée");
    }
  }

  await audit({ userId: me.id, module: "products", action: "import", entityType: "file", entityId: file.name, newValues: { mode, rows: sheet.rows.length, created: report.created, updated: report.updated, skipped: report.skipped, stockMoves: report.stockMoves } });
  updateTag("products");
  updateTag("categories");
  updateTag("brands");
  return report;
}
