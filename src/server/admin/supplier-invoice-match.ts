import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, productSuppliers, products, suppliers } from "@/db/schema";
import { round3 } from "@/lib/totals";
import type { ExtractedInvoice } from "../invoice-ai";

/** Référence normalisée : majuscules, sans espaces ni ponctuation (« 6205-2RS » = « 6205 2rs »). */
export const normRef = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normSql = (col: unknown) => sql`regexp_replace(upper(coalesce(${col}, '')), '[^A-Z0-9]', '', 'g')`;

export type SupplierMatch = { id: number; name: string; taxId: string | null; address: string | null; how: "taxId" | "name" } | null;

/** Fournisseur existant : matricule fiscal identique, sinon nom très proche. */
export async function matchSupplier(name: string | null, taxId: string | null): Promise<SupplierMatch> {
  const t = normRef(taxId);
  if (t.length >= 5) {
    const [s] = await db.select().from(suppliers).where(sql`${normSql(suppliers.taxId)} = ${t}`).limit(1);
    if (s) return { id: s.id, name: s.name, taxId: s.taxId, address: [s.address, s.city].filter(Boolean).join(", ") || null, how: "taxId" };
  }
  const n = (name ?? "").trim();
  if (n.length >= 3) {
    const [s] = await db
      .select({ s: suppliers, score: sql<number>`similarity(lower(${suppliers.name}), lower(${n}))` })
      .from(suppliers)
      .where(sql`similarity(lower(${suppliers.name}), lower(${n})) > 0.45 or lower(${suppliers.name}) = lower(${n})`)
      .orderBy(sql`similarity(lower(${suppliers.name}), lower(${n})) desc`)
      .limit(1);
    if (s) return { id: s.s.id, name: s.s.name, taxId: s.s.taxId, address: [s.s.address, s.s.city].filter(Boolean).join(", ") || null, how: "name" };
  }
  return null;
}

export type ProductMatch = { productId: number; sku: string; name: string; manufacturerRef: string | null; brand: string | null; vatRate: number; cost: number | null; confidence: "exact" | "probable" };

/**
 * Rapproche chaque ligne d'un produit SOGER :
 * 1. référence identique (SOGER, fabricant, code-barres, ou référence de ce fournisseur) → « exact » ;
 * 2. sinon désignation très proche → « probable » (à confirmer par l'administrateur).
 */
export async function matchProducts(lines: { reference: string | null; manufacturerRef: string | null; description: string }[], supplierId: number | null): Promise<(ProductMatch | null)[]> {
  const cols = { id: products.id, sku: products.sku, name: products.name, manufacturerRef: products.manufacturerRef, brand: brands.name, vatRate: products.vatRate, cost: products.purchasePrice };
  const toMatch = (r: { id: number; sku: string; name: string; manufacturerRef: string | null; brand: string | null; vatRate: string; cost: string | null }, confidence: ProductMatch["confidence"]): ProductMatch => ({
    productId: r.id, sku: r.sku, name: r.name, manufacturerRef: r.manufacturerRef, brand: r.brand, vatRate: Number(r.vatRate), cost: r.cost == null ? null : Number(r.cost), confidence,
  });
  const out: (ProductMatch | null)[] = [];
  for (const l of lines) {
    const refs = [...new Set([normRef(l.reference), normRef(l.manufacturerRef)].filter((r) => r.length >= 3))];
    let found: ProductMatch | null = null;
    if (refs.length) {
      const bySupplierRef = supplierId
        ? await db.select({ id: productSuppliers.productId }).from(productSuppliers).where(and(eq(productSuppliers.supplierId, supplierId), sql`${normSql(productSuppliers.supplierRef)} in ${refs}`)).limit(1)
        : [];
      const [r] = await db
        .select(cols)
        .from(products)
        .leftJoin(brands, eq(brands.id, products.brandId))
        .where(
          bySupplierRef.length
            ? inArray(products.id, [bySupplierRef[0].id])
            : sql`${normSql(products.sku)} in ${refs} or ${normSql(products.manufacturerRef)} in ${refs} or ${normSql(products.barcode)} in ${refs}`,
        )
        .orderBy(sql`${products.status} = 'archived'`)
        .limit(1);
      if (r) found = toMatch(r, "exact");
    }
    if (!found && l.description.trim().length >= 4) {
      const d = l.description.trim().toLowerCase();
      const [r] = await db
        .select({ ...cols, score: sql<number>`similarity(lower(${products.name}), ${d})` })
        .from(products)
        .leftJoin(brands, eq(brands.id, products.brandId))
        .where(and(sql`${products.status} <> 'archived'`, sql`similarity(lower(${products.name}), ${d}) > 0.5`))
        .orderBy(sql`similarity(lower(${products.name}), ${d}) desc`)
        .limit(1);
      if (r) found = toMatch(r, "probable");
    }
    out.push(found);
  }
  return out;
}

export type DraftLine = {
  productId: number | null;
  match: ProductMatch["confidence"] | null;
  sku: string;
  supplierRef: string;
  manufacturerRef: string;
  brand: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  vatRate: number;
  /** Montant HT imprimé sur la facture, pour contrôle. */
  printedTotal: number | null;
};
export type InvoiceDraft = {
  supplier: { id: number | null; name: string; taxId: string; address: string; how: NonNullable<SupplierMatch>["how"] | null };
  externalRef: string;
  issueDate: string;
  dueDate: string;
  stampDuty: number;
  amountPaid: number;
  paymentMethod: string;
  printed: ExtractedInvoice["totals"] | null;
  documentType: ExtractedInvoice["documentType"] | null;
  warnings: string[];
  lines: DraftLine[];
};
const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : "");

/** Données lues sur la facture → brouillon modifiable (fournisseur et produits rapprochés, avertissements). */
export async function buildDraft(x: ExtractedInvoice): Promise<InvoiceDraft> {
  const sup = await matchSupplier(x.supplier.name, x.supplier.taxId);
  const matches = await matchProducts(x.lines.map((l) => ({ reference: l.reference, manufacturerRef: l.manufacturerRef, description: l.description })), sup?.id ?? null);
  const warnings = [...x.warnings];
  if (x.documentType !== "invoice") warnings.unshift(x.documentType === "credit_note" ? "Ce document semble être un avoir fournisseur : vérifiez avant d'enregistrer." : "Ce document ne semble pas être une facture (devis, bon de livraison…) : vérifiez avant d'enregistrer.");

  const lines: DraftLine[] = x.lines.map((l, i) => {
    const m = matches[i];
    const qty = l.quantity && l.quantity > 0 ? l.quantity : 1;
    let unit = l.unitPriceHT ?? null;
    // Prix unitaire absent mais total de ligne présent : on le déduit (et on le signale).
    if (unit == null && l.lineTotalHT != null) {
      unit = round3(l.lineTotalHT / qty / (1 - (l.discountRate ?? 0) / 100 || 1));
      warnings.push(`Ligne ${i + 1} : prix unitaire déduit du total de ligne.`);
    }
    return {
      productId: m?.productId ?? null,
      match: m?.confidence ?? null,
      sku: m?.sku ?? "",
      supplierRef: l.reference ?? "",
      manufacturerRef: l.manufacturerRef ?? m?.manufacturerRef ?? (m ? "" : l.reference ?? ""),
      brand: l.brand ?? m?.brand ?? "",
      description: l.description,
      quantity: qty,
      unitPrice: unit ?? 0,
      discountRate: l.discountRate ?? 0,
      vatRate: [0, 7, 13, 19].includes(l.vatRate ?? -1) ? l.vatRate! : (m?.vatRate ?? 19),
      printedTotal: l.lineTotalHT,
    };
  });
  return {
    supplier: { id: sup?.id ?? null, name: sup?.name ?? x.supplier.name ?? "", taxId: sup?.taxId ?? x.supplier.taxId ?? "", address: sup?.address ?? x.supplier.address ?? "", how: sup?.how ?? null },
    externalRef: x.invoiceNumber ?? "",
    issueDate: isoDate(x.issueDate),
    dueDate: isoDate(x.dueDate),
    stampDuty: x.totals.stampDuty ?? 0,
    amountPaid: x.amountPaid ?? 0,
    paymentMethod: x.paymentMethod ?? "transfer",
    printed: x.totals,
    documentType: x.documentType,
    warnings,
    lines,
  };
}
