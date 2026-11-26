"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { brands, invoiceItems, invoices, mediaFiles, productSuppliers, products, purchaseOrders, suppliers, warehouses } from "@/db/schema";
import { documentTotals, fmt3, round3 } from "@/lib/totals";
import { formatTND, slugify } from "@/lib/utils";
import { audit } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { recordPayment } from "../finance";
import { applyStockMovement } from "../inventory";
import { ExtractionError, aiEnabled, extractInvoice, type ExtractedInvoice } from "../invoice-ai";
import { readPdfInvoice } from "../invoice-pdf";
import { BusinessError, defaultWarehouseId } from "../orders";
import { nextDocumentNumber } from "../sequences";
import { buildDraft, normRef, type InvoiceDraft } from "./supplier-invoice-match";

const denied = (e: unknown) => (e instanceof AccessDenied ? e.message : null);

/** Factures fournisseurs = prix d'achat : saisie réservée aux rôles qui voient les coûts. */
async function assertPurchaseInvoices() {
  const me = await assertStaff("invoices.create");
  if (!me.can("products.view_cost")) throw new AccessDenied("products.view_cost");
  return me;
}

/* ─── 1. Fichier original (PDF / photo) ─────────────────────────────── */

const MAX_FILE = 9 * 1024 * 1024;
function sniffDoc(b: Uint8Array) {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf"; // %PDF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

export type UploadResult = { ok: true; fileId: number; mimeType: string; name: string } | { ok: false; message: string };

/** Conserve le fichier original (privé). Aucune facture n'est créée à ce stade. */
export async function uploadInvoiceFileAction(form: FormData): Promise<UploadResult> {
  try {
    await assertPurchaseInvoices();
  } catch (e) {
    return { ok: false, message: denied(e) ?? "Accès refusé." };
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choisissez un fichier PDF, JPG ou PNG." };
  if (file.size > MAX_FILE) return { ok: false, message: `Fichier trop lourd (${(file.size / 1024 / 1024).toFixed(1)} Mo, 9 Mo maximum).` };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffDoc(bytes);
  if (!mimeType) return { ok: false, message: "Format non accepté : PDF, JPG ou PNG uniquement." };
  const name = file.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "facture";
  const [row] = await db.insert(mediaFiles).values({ mimeType, bytes: bytes.length, data: bytes, fileName: name, isPrivate: true }).returning({ id: mediaFiles.id });
  return { ok: true, fileId: row.id, mimeType, name };
}

/* ─── 2. Lecture automatique + rapprochement ────────────────────────── */

export type { DraftLine, InvoiceDraft } from "./supplier-invoice-match";
export type ExtractResult = { ok: true; draft: InvoiceDraft; duplicate: string | null; raw: ExtractedInvoice; source: "ai" | "text" } | { ok: false; message: string; disabled?: boolean };


/** Lit le fichier avec l'IA et renvoie un brouillon modifiable. Rien n'est enregistré. */
export async function extractInvoiceAction(fileId: number): Promise<ExtractResult> {
  try {
    await assertPurchaseInvoices();
  } catch (e) {
    return { ok: false, message: denied(e) ?? "Accès refusé." };
  }
  const [f] = await db.select({ data: mediaFiles.data, mimeType: mediaFiles.mimeType, isPrivate: mediaFiles.isPrivate }).from(mediaFiles).where(eq(mediaFiles.id, Number(fileId)));
  if (!f || !f.isPrivate) return { ok: false, message: "Fichier introuvable." };
  const isPdf = f.mimeType === "application/pdf";
  let x: ExtractedInvoice | null = null;
  let source: "ai" | "text" = "ai";
  let aiError: string | null = null;
  // 1. Lecture IA (PDF et photos) si la clé est configurée.
  if (aiEnabled()) {
    try {
      x = await extractInvoice(f);
    } catch (e) {
      if (!(e instanceof ExtractionError)) console.error("extractInvoiceAction", e);
      aiError = e instanceof ExtractionError ? e.message : "Lecture automatique impossible.";
    }
  }
  // 2. Sinon (ou en secours) : lecture gratuite du texte du PDF.
  if (!x && isPdf) {
    x = await readPdfInvoice(f.data);
    source = "text";
    if (x && aiError) x.warnings.unshift(`Lecture IA indisponible (${aiError}) : lecture du texte du PDF utilisée.`);
  }
  if (!x) {
    if (aiError) return { ok: false, message: aiError };
    return isPdf
      ? { ok: false, message: "Ce PDF ne contient pas de texte lisible (document scanné) : la lecture automatique demande l'IA (clé ANTHROPIC_API_KEY). Complétez le formulaire à partir de l'aperçu." }
      : { ok: false, disabled: true, message: "La lecture automatique d'une photo demande l'IA (clé ANTHROPIC_API_KEY). Complétez le formulaire à partir de l'aperçu." };
  }
  const draft = await buildDraft(x);
  // `raw` est renvoyé avec la facture validée et conservé (historique de la reconnaissance).
  return { ok: true, draft, raw: x, source, duplicate: await findDuplicate(draft.supplier.id, draft.supplier.name, draft.externalRef) };
}

/** Facture déjà saisie ? (même fournisseur + même numéro, hors factures annulées) */
async function findDuplicate(supplierId: number | null, supplierName: string, ref: string) {
  if (!ref.trim()) return null;
  const [d] = await db
    .select({ number: invoices.number, issueDate: invoices.issueDate })
    .from(invoices)
    .where(and(eq(invoices.kind, "supplier"), sql`${invoices.status} <> 'cancelled'`, sql`lower(${invoices.externalRef}) = lower(${ref.trim()})`, supplierId ? eq(invoices.supplierId, supplierId) : sql`lower(${invoices.billingName}) = lower(${supplierName.trim()})`))
    .limit(1);
  return d ? `${d.number} du ${d.issueDate}` : null;
}

export async function checkDuplicateAction(supplierId: number | null, supplierName: string, ref: string): Promise<string | null> {
  try {
    await assertPurchaseInvoices();
  } catch {
    return null;
  }
  return findDuplicate(supplierId, supplierName, ref);
}

/* ─── 3. Recherche fournisseurs ─────────────────────────────────────── */

export type SupplierOption = { id: number; name: string; code: string; taxId: string | null; address: string | null; paymentTermsDays: number };

export async function searchSuppliersAction(q: string): Promise<SupplierOption[]> {
  try {
    await assertPurchaseInvoices();
  } catch {
    return [];
  }
  const t = q.trim().slice(0, 60);
  if (t.length < 2) return [];
  const like = `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select()
    .from(suppliers)
    .where(sql`${suppliers.name} ilike ${like} or ${suppliers.code} ilike ${like} or ${suppliers.taxId} ilike ${like} or ${suppliers.phone} ilike ${like}`)
    .orderBy(suppliers.name)
    .limit(10);
  return rows.map((s) => ({ id: s.id, name: s.name, code: s.code, taxId: s.taxId, address: [s.address, s.city].filter(Boolean).join(", ") || null, paymentTermsDays: s.paymentTermsDays }));
}

/* ─── 4. Création rapide d'un produit non reconnu ───────────────────── */

const quickProductSchema = z.object({
  sku: z.string().trim().min(2, "Référence SOGER obligatoire").max(60).regex(/^[A-Za-z0-9._\-/ ]+$/, "Référence : lettres, chiffres, - _ . /"),
  name: z.string().trim().min(3, "Désignation obligatoire").max(200),
  manufacturerRef: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  purchasePrice: z.number().min(0).max(1e9),
  vatRate: z.union([z.literal(0), z.literal(7), z.literal(13), z.literal(19)]),
});
export type QuickProductResult = { ok: true; product: { productId: number; sku: string; name: string } } | { ok: false; message: string };

/** Crée la fiche d'un article absent du catalogue (brouillon, non publiée, sans prix de vente). */
export async function quickCreateProductAction(input: z.input<typeof quickProductSchema>): Promise<QuickProductResult> {
  let me;
  try {
    me = await assertStaff("products.create");
  } catch (e) {
    return { ok: false, message: denied(e) ?? "Accès refusé." };
  }
  const p = quickProductSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Données invalides." };
  const d = p.data;
  const sku = d.sku.toUpperCase();
  try {
    const created = await db.transaction(async (tx) => {
      const [dup] = await tx.select({ id: products.id }).from(products).where(eq(products.sku, sku));
      if (dup) throw new BusinessError(`La référence ${sku} existe déjà : associez la ligne à ce produit.`);
      let brandId: number | null = null;
      if (d.brand) {
        const [b] = await tx.select({ id: brands.id }).from(brands).where(sql`lower(${brands.name}) = lower(${d.brand})`);
        brandId = b?.id ?? null;
      }
      const [row] = await tx
        .insert(products)
        .values({ sku, name: d.name, slug: slugify(`${d.name}-${sku}`).slice(0, 200), manufacturerRef: d.manufacturerRef || null, brandId, purchasePrice: fmt3(d.purchasePrice), vatRate: d.vatRate.toFixed(2), status: "draft", isActive: true })
        .returning({ id: products.id });
      await audit({ userId: me.id, module: "products", action: "create_from_invoice", entityType: "product", entityId: row.id, newValues: { sku, name: d.name } }, tx);
      return row.id;
    });
    return { ok: true, product: { productId: created, sku, name: d.name } };
  } catch (e) {
    return { ok: false, message: e instanceof BusinessError ? e.message : "Création impossible (référence ou adresse déjà utilisée)." };
  }
}

/* ─── 5. Enregistrement (après validation humaine) ──────────────────── */

const num = z.number().finite();
const saveSchema = z.object({
  sourceFileId: z.number().int().positive().nullable(),
  extracted: z.unknown().optional(),
  supplier: z.object({
    id: z.number().int().positive().nullable(),
    name: z.string().trim().min(2, "Nom du fournisseur obligatoire").max(200),
    taxId: z.string().trim().max(40),
    address: z.string().trim().max(300),
  }),
  externalRef: z.string().trim().min(1, "Numéro de facture obligatoire").max(60),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de facture obligatoire"),
  dueDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  purchaseType: z.enum(["stock", "received", "expense"]),
  purchaseOrderId: z.number().int().positive().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable(),
        supplierRef: z.string().trim().max(80),
        manufacturerRef: z.string().trim().max(80),
        brand: z.string().trim().max(80),
        description: z.string().trim().min(1, "Désignation obligatoire sur chaque ligne").max(300),
        quantity: num.positive("Quantité supérieure à 0 obligatoire").max(1e7),
        unitPrice: num.min(0, "Prix d'achat négatif").max(1e9),
        discountRate: num.min(0).max(100),
        vatRate: z.union([z.literal(0), z.literal(7), z.literal(13), z.literal(19)]),
      }),
    )
    .min(1, "Ajoutez au moins une ligne")
    .max(300),
  stampDuty: num.min(0).max(1000),
  payment: z.object({ amount: num.min(0), method: z.enum(["cash", "card", "transfer", "check", "other"]), reference: z.string().trim().max(80) }),
  updateCosts: z.boolean(),
  notes: z.string().trim().max(2000),
});
export type SaveInvoiceInput = z.input<typeof saveSchema>;
export type SaveInvoiceResult = { ok: true; id: number; number: string } | { ok: false; message: string; field?: string };

export async function saveSupplierInvoiceAction(input: SaveInvoiceInput): Promise<SaveInvoiceResult> {
  let me;
  try {
    me = await assertPurchaseInvoices();
  } catch (e) {
    return { ok: false, message: denied(e) ?? "Accès refusé." };
  }
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, message: i?.message ?? "Données invalides.", field: i?.path.join(".") };
  }
  const d = parsed.data;
  const t = documentTotals(d.lines, { stampDuty: d.stampDuty });
  const paid = round3(d.payment.amount);
  if (paid > t.total + 0.0005) return { ok: false, message: `Montant payé (${formatTND(paid)}) supérieur au total de la facture (${formatTND(t.total)}).`, field: "payment.amount" };
  if (paid > 0 && !me.can("payments.create")) return { ok: false, message: "Vous n'avez pas le droit d'enregistrer un paiement : laissez « Montant payé » à 0." };
  const stockLines = d.purchaseType === "stock" ? d.lines.filter((l) => l.productId) : [];
  if (stockLines.length && !me.can("stock.receive")) return { ok: false, message: "Entrée en stock non autorisée pour votre rôle : choisissez « Déjà réceptionnée » ou « Frais / services »." };
  if (!d.supplier.id && !me.can("suppliers.create")) return { ok: false, message: "Ce fournisseur n'existe pas et votre rôle ne permet pas de le créer : sélectionnez un fournisseur existant." };

  try {
    const inv = await db.transaction(async (tx) => {
      // Fournisseur : existant, ou créé à partir des informations de la facture.
      let supplierId = d.supplier.id;
      if (supplierId) {
        const [s] = await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId));
        if (!s) throw new BusinessError("Fournisseur introuvable.");
      } else {
        const t2 = normRef(d.supplier.taxId);
        const [same] = t2.length >= 5 ? await tx.select({ id: suppliers.id }).from(suppliers).where(sql`regexp_replace(upper(coalesce(${suppliers.taxId}, '')), '[^A-Z0-9]', '', 'g') = ${t2}`) : [];
        if (same) supplierId = same.id;
        else {
          const code = await nextDocumentNumber(tx, "supplier");
          const [s] = await tx.insert(suppliers).values({ code, name: d.supplier.name, taxId: d.supplier.taxId || null, address: d.supplier.address || null }).returning({ id: suppliers.id });
          supplierId = s.id;
          await audit({ userId: me.id, module: "suppliers", action: "create_from_invoice", entityType: "supplier", entityId: s.id, newValues: { name: d.supplier.name, taxId: d.supplier.taxId } }, tx);
        }
      }
      const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId!));

      // Doublon : même fournisseur + même numéro (vérifié aussi par un index unique en base).
      const [dup] = await tx.select({ number: invoices.number }).from(invoices).where(and(eq(invoices.kind, "supplier"), eq(invoices.supplierId, sup.id), sql`${invoices.status} <> 'cancelled'`, sql`lower(${invoices.externalRef}) = lower(${d.externalRef})`));
      if (dup) throw new BusinessError(`Facture déjà enregistrée : ${d.externalRef} de ${sup.name} (${dup.number}).`);

      if (d.purchaseOrderId) {
        const [po] = await tx.select({ supplierId: purchaseOrders.supplierId }).from(purchaseOrders).where(eq(purchaseOrders.id, d.purchaseOrderId));
        if (!po || po.supplierId !== sup.id) throw new BusinessError("Le bon de commande choisi n'appartient pas à ce fournisseur.");
      }
      const productIds = d.lines.map((l) => l.productId).filter((x): x is number => !!x);
      const prods = productIds.length ? await tx.select({ id: products.id, sku: products.sku }).from(products).where(sql`${products.id} in ${productIds}`) : [];
      const skuOf = new Map(prods.map((p) => [p.id, p.sku]));
      if (productIds.some((id) => !skuOf.has(id))) throw new BusinessError("Un produit associé n'existe plus.");

      const number = await nextDocumentNumber(tx, "supplier_invoice");
      const due = d.dueDate || new Date(new Date(d.issueDate).getTime() + sup.paymentTermsDays * 86_400_000).toISOString().slice(0, 10);
      const [inv] = await tx
        .insert(invoices)
        .values({
          kind: "supplier",
          number,
          externalRef: d.externalRef,
          supplierId: sup.id,
          purchaseOrderId: d.purchaseOrderId,
          status: "issued",
          issueDate: d.issueDate,
          dueDate: due,
          billingName: sup.name,
          billingTaxId: d.supplier.taxId || sup.taxId,
          billingAddress: d.supplier.address || [sup.address, sup.city].filter(Boolean).join(", ") || null,
          subtotal: fmt3(t.subtotal),
          discountTotal: fmt3(t.discountTotal),
          vatTotal: fmt3(t.vatTotal),
          stampDuty: fmt3(t.stampDuty),
          total: fmt3(t.total),
          purchaseType: d.purchaseType,
          sourceFileId: d.sourceFileId,
          extractedData: d.extracted ?? null,
          notes: d.notes || null,
          createdBy: me.id,
          issuedAt: new Date(),
        })
        .returning();
      await tx.insert(invoiceItems).values(
        d.lines.map((l, k) => ({
          invoiceId: inv.id,
          productId: l.productId,
          sku: l.productId ? skuOf.get(l.productId)! : l.supplierRef || null,
          manufacturerRef: l.manufacturerRef || null,
          brand: l.brand || null,
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: fmt3(l.unitPrice),
          discountRate: String(l.discountRate),
          vatRate: l.vatRate.toFixed(2),
          lineTotal: fmt3(t.lines[k].net),
          sortOrder: k,
        })),
      );

      // Stock : uniquement pour les marchandises non encore réceptionnées, et seulement maintenant (validation).
      if (stockLines.length) {
        const warehouseId = await defaultWarehouseId(tx);
        const [wh] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, warehouseId));
        for (const l of stockLines) {
          const unitCost = round3(l.unitPrice * (1 - l.discountRate / 100));
          await applyStockMovement(tx, { productId: l.productId!, warehouseId: wh.id, type: "purchase_receipt", quantity: l.quantity, unitCost: fmt3(unitCost), referenceType: "supplier_invoice", referenceId: inv.id, note: `${number} — facture ${d.externalRef} (${sup.name})`, userId: me.id });
        }
      }
      // Prix d'achat des produits et références fournisseur.
      if (d.updateCosts && d.purchaseType !== "expense") {
        for (const l of d.lines.filter((x) => x.productId)) {
          const unitCost = fmt3(round3(l.unitPrice * (1 - l.discountRate / 100)));
          await tx.update(products).set({ purchasePrice: unitCost, updatedAt: new Date() }).where(eq(products.id, l.productId!));
          await tx
            .insert(productSuppliers)
            .values({ productId: l.productId!, supplierId: sup.id, supplierRef: l.supplierRef || null, purchasePrice: unitCost })
            .onConflictDoUpdate({ target: [productSuppliers.productId, productSuppliers.supplierId], set: { purchasePrice: unitCost, ...(l.supplierRef ? { supplierRef: l.supplierRef } : {}), updatedAt: new Date() } });
        }
      }
      // Paiement : module financier existant (décaissement fournisseur), met à jour le statut de la facture.
      if (paid > 0) {
        await recordPayment(tx, { direction: "out", method: d.payment.method, amount: paid, supplierId: sup.id, invoiceId: inv.id, reference: d.payment.reference || null, notes: "Règlement saisi avec la facture", userId: me.id });
      }
      await audit({ userId: me.id, module: "invoices", action: "create_supplier", entityType: "invoice", entityId: inv.id, newValues: { number, ref: d.externalRef, supplier: sup.name, total: fmt3(t.total), paid: fmt3(paid), type: d.purchaseType, lines: d.lines.length, stockLines: stockLines.length, file: d.sourceFileId } }, tx);
      return inv;
    });
    revalidatePath("/admin/factures");
    return { ok: true, id: inv.id, number: inv.number };
  } catch (e) {
    if (e instanceof BusinessError) return { ok: false, message: e.message };
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "23505") return { ok: false, message: "Facture déjà enregistrée pour ce fournisseur (même numéro)." };
    console.error("saveSupplierInvoiceAction", e);
    return { ok: false, message: "Enregistrement impossible. Vérifiez les données et réessayez." };
  }
}

/* ─── 6. Bons de commande ouverts du fournisseur (rattachement facultatif) ── */

export async function supplierPurchaseOrdersAction(supplierId: number): Promise<{ id: number; number: string; status: string; total: string }[]> {
  try {
    await assertPurchaseInvoices();
  } catch {
    return [];
  }
  return db
    .select({ id: purchaseOrders.id, number: purchaseOrders.number, status: purchaseOrders.status, total: purchaseOrders.total })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.supplierId, Number(supplierId)), sql`${purchaseOrders.status} <> 'cancelled'`))
    .orderBy(sql`${purchaseOrders.createdAt} desc`)
    .limit(20);
}

/* ─── 7. Suppression du fichier importé ─────────────────────────────── */

/** Supprime un fichier importé qui n'est rattaché à aucune facture (erreur de fichier, mauvais document). */
export async function deleteInvoiceFileAction(fileId: number): Promise<{ ok: boolean; message: string }> {
  let me;
  try {
    me = await assertPurchaseInvoices();
  } catch (e) {
    return { ok: false, message: denied(e) ?? "Accès refusé." };
  }
  const id = Number(fileId);
  const [f] = await db.select({ id: mediaFiles.id, isPrivate: mediaFiles.isPrivate, fileName: mediaFiles.fileName }).from(mediaFiles).where(eq(mediaFiles.id, id));
  if (!f || !f.isPrivate) return { ok: false, message: "Fichier introuvable." };
  const [used] = await db.select({ number: invoices.number }).from(invoices).where(eq(invoices.sourceFileId, id)).limit(1);
  if (used) return { ok: false, message: `Ce fichier est l'original de la facture ${used.number} : retirez-le depuis la fiche de la facture.` };
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
  await audit({ userId: me.id, module: "invoices", action: "delete_import_file", entityType: "media_file", entityId: id, oldValues: { fileName: f.fileName } });
  return { ok: true, message: "Fichier supprimé." };
}

/** Retire (et supprime) le fichier original d'une facture déjà enregistrée. La facture elle-même est conservée. */
export async function removeInvoiceOriginalAction(form: FormData) {
  const me = await assertPurchaseInvoices();
  const invoiceId = Number(form.get("invoiceId"));
  const [inv] = await db.select({ id: invoices.id, number: invoices.number, fileId: invoices.sourceFileId }).from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.kind, "supplier")));
  if (!inv?.fileId) redirect(`/admin/factures/${invoiceId}?erreur=${encodeURIComponent("Aucun fichier original à retirer.")}`);
  await db.transaction(async (tx) => {
    await tx.update(invoices).set({ sourceFileId: null, updatedAt: new Date() }).where(eq(invoices.id, inv.id));
    const [stillUsed] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.sourceFileId, inv.fileId!)).limit(1);
    if (!stillUsed) await tx.delete(mediaFiles).where(eq(mediaFiles.id, inv.fileId!));
    await audit({ userId: me.id, module: "invoices", action: "remove_original", entityType: "invoice", entityId: inv.id, oldValues: { fileId: inv.fileId } }, tx);
  });
  revalidatePath(`/admin/factures/${invoiceId}`);
  redirect(`/admin/factures/${invoiceId}?ok=${encodeURIComponent("Fichier original retiré. La facture est conservée.")}`);
}
