"use server";

import { and, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { brands, categories, productAttributes, productEquivalents, productImages, products, stock, warehouses } from "@/db/schema";
import { slugify } from "@/lib/utils";
import { audit, diff } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { applyStockMovement } from "../inventory";
import { deleteStoredImage, UploadError, uploadImage } from "../uploads";
import type { FormState } from "../account-actions";

const money = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => v === "" || (/^\d+(\.\d{1,3})?$/.test(v) && Number(v) < 1e10), "Montant invalide (ex. 12.500)")
  .transform((v) => (v === "" ? null : Number(v).toFixed(3)));

const productSchema = z.object({
  sku: z.string().trim().min(2, "Référence obligatoire").max(60).regex(/^[A-Za-z0-9._\-/ ]+$/, "Caractères autorisés : lettres, chiffres, - _ . /"),
  manufacturerRef: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(40).optional(),
  name: z.string().trim().min(3, "Désignation obligatoire").max(200),
  slug: z.string().trim().max(200).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10000).optional(),
  categoryId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  brandId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  unit: z.string().trim().min(1).max(20),
  purchasePrice: money,
  salePrice: money,
  proPrice: money,
  vatRate: z.enum(["0.00", "7.00", "13.00", "19.00"]),
  minStock: z.coerce.number().min(0).max(1e7),
  weightKg: z.string().trim().optional(),
  status: z.enum(["draft", "published", "archived"]),
  isFeatured: z.literal("on").optional(),
  isNew: z.literal("on").optional(),
  isActive: z.literal("on").optional(),
  attributes: z.string().optional(),
  dimensions: z.string().trim().max(120).optional(),
  stockQty: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => v === "" || (/^\d+(\.\d{1,3})?$/.test(v) && Number(v) < 1e7), "Quantité invalide")
    .optional(),
  equivalents: z.string().max(2000).optional(),
  compatibles: z.string().max(2000).optional(),
});

const attributesSchema = z
  .array(z.object({ key: z.string().trim().max(40), label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(120), unit: z.string().trim().max(20).optional() }))
  .max(40);

const fieldErrors = (e: z.ZodError) => z.flattenError(e).fieldErrors as Record<string, string[] | undefined>;
const denied = (e: unknown): FormState | null => (e instanceof AccessDenied ? { status: "error", message: e.message } : null);
const keyOf = (label: string) => slugify(label).replace(/-/g, "_").slice(0, 40) || "attr";

class StockConfigError extends Error {}

function refreshCatalog(slug?: string) {
  updateTag("products");
  updateTag("categories");
  if (slug) updateTag(`product:${slug}`);
}

export async function saveProductAction(_: FormState, form: FormData): Promise<FormState> {
  const id = Number(form.get("id")) || null;
  let me;
  try {
    me = await assertStaff(id ? "products.update" : "products.create");
  } catch (e) {
    return denied(e) ?? { status: "error", message: "Erreur" };
  }
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Merci de corriger les champs indiqués.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  if (d.status === "published" && !me.can("products.publish")) {
    const current = id ? (await db.select({ status: products.status }).from(products).where(eq(products.id, id)))[0] : null;
    if (current?.status !== "published") return { status: "error", message: "Vous n'avez pas le droit de publier un produit." };
  }
  // Le stock n'est corrigé que si la valeur a été modifiée dans le formulaire (évite d'écraser une vente faite entre-temps).
  const stockBase = String(form.get("stockBase") ?? "").trim().replace(",", ".");
  const wantsStock = d.stockQty !== undefined && d.stockQty !== "" && (stockBase === "" || Number(d.stockQty) !== Number(stockBase));
  if (wantsStock && !me.can("stock.adjust")) return { status: "error", message: "Vous n'avez pas le droit de modifier le stock." };

  let attrs: z.infer<typeof attributesSchema> = [];
  try {
    attrs = attributesSchema.parse(JSON.parse(d.attributes || "[]"));
  } catch {
    return { status: "error", message: "Caractéristiques techniques invalides." };
  }
  // Les dimensions sont une caractéristique dédiée (affichée sur la fiche produit).
  attrs = attrs.filter((a) => a.key !== "dimensions");
  if (d.dimensions) attrs.unshift({ key: "dimensions", label: "Dimensions", value: d.dimensions, unit: undefined });

  const slug = slugify(d.slug || `${d.name}-${d.sku}`).slice(0, 200);
  const values = {
    sku: d.sku.toUpperCase(),
    manufacturerRef: d.manufacturerRef || null,
    barcode: d.barcode || null,
    name: d.name,
    slug,
    shortDescription: d.shortDescription || null,
    description: d.description || null,
    categoryId: d.categoryId ?? null,
    brandId: d.brandId ?? null,
    unit: d.unit,
    salePrice: d.salePrice,
    proPrice: d.proPrice,
    vatRate: d.vatRate,
    minStock: String(d.minStock),
    weightKg: d.weightKg ? String(Number(d.weightKg.replace(",", ".")) || 0) : null,
    status: d.status,
    isFeatured: !!d.isFeatured,
    isNew: !!d.isNew,
    isActive: !!d.isActive,
  };

  // Prix d'achat : modifiable uniquement avec la permission « products.view_cost » (sinon valeur existante conservée).
  const costPatch = me.can("products.view_cost") ? { purchasePrice: d.purchasePrice } : {};

  const dup = await db
    .select({ sku: products.sku, slug: products.slug })
    .from(products)
    .where(and(or(eq(products.sku, values.sku), eq(products.slug, slug), values.barcode ? eq(products.barcode, values.barcode) : undefined), id ? ne(products.id, id) : undefined))
    .limit(1);
  if (dup.length) {
    const which = dup[0].sku === values.sku ? "sku" : dup[0].slug === slug ? "slug" : "barcode";
    return { status: "error", message: "Une autre fiche utilise déjà cette valeur.", fieldErrors: { [which]: ["Déjà utilisé par un autre produit"] } };
  }

  const skuList = (s?: string) => [...new Set((s ?? "").split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  const eqSkus = skuList(d.equivalents);
  const compSkus = skuList(d.compatibles);

  let savedId = id;
  let ignored = 0;
  try {
    await db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
        if (!before) throw new Error("Produit introuvable");
        await tx.update(products).set({ ...values, ...costPatch, updatedAt: new Date() }).where(eq(products.id, id));
        const changes = diff(before as unknown as Record<string, unknown>, { ...values, ...costPatch });
        if (changes.changed) await audit({ userId: me.id, module: "products", action: "update", entityType: "product", entityId: id, oldValues: changes.oldValues, newValues: changes.newValues }, tx);
      } else {
        const [created] = await tx.insert(products).values({ ...values, ...costPatch }).returning({ id: products.id });
        savedId = created.id;
        await audit({ userId: me.id, module: "products", action: "create", entityType: "product", entityId: created.id, newValues: { ...values, purchasePrice: costPatch.purchasePrice ? "***" : null } }, tx);
      }
      const pid = savedId!;
      await tx.delete(productAttributes).where(eq(productAttributes.productId, pid));
      if (attrs.length) {
        await tx.insert(productAttributes).values(
          attrs.map((a, i) => {
            const n = a.value.replace(",", ".");
            return { productId: pid, key: a.key || keyOf(a.label), label: a.label, value: a.value, unit: a.unit || null, numericValue: /^-?\d+(\.\d+)?$/.test(n) ? n : null, sortOrder: i };
          }),
        );
      }
      // Relations : on remplace les liens « sortants » de ce produit.
      await tx.delete(productEquivalents).where(and(eq(productEquivalents.productId, pid), inArray(productEquivalents.kind, ["equivalent", "compatible"])));
      const targets = await tx.select({ id: products.id, sku: products.sku }).from(products).where(inArray(products.sku, [...eqSkus, ...compSkus, "__none__"]));
      const idBySku = new Map(targets.map((t) => [t.sku, t.id]));
      const rel = [
        ...eqSkus.map((s) => ({ s, kind: "equivalent" as const })),
        ...compSkus.map((s) => ({ s, kind: "compatible" as const })),
      ].filter((r) => idBySku.has(r.s) && idBySku.get(r.s) !== pid);
      ignored = eqSkus.length + compSkus.length - rel.length;
      if (rel.length) await tx.insert(productEquivalents).values(rel.map((r) => ({ productId: pid, relatedProductId: idBySku.get(r.s)!, kind: r.kind }))).onConflictDoNothing();

      // Quantité en stock (dépôt principal) : écart enregistré comme mouvement de stock, jamais en écriture directe.
      if (wantsStock) {
        const [wh] = await tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.isDefault, true), eq(warehouses.isActive, true)));
        if (!wh) throw new StockConfigError();
        await tx.insert(stock).values({ productId: pid, warehouseId: wh.id }).onConflictDoNothing();
        const [cur] = await tx.select({ q: stock.quantityOnHand }).from(stock).where(and(eq(stock.productId, pid), eq(stock.warehouseId, wh.id))).for("update");
        const delta = Math.round((Number(d.stockQty) - Number(cur.q)) * 1000) / 1000;
        if (delta !== 0) {
          await applyStockMovement(tx, { productId: pid, warehouseId: wh.id, type: id ? "adjustment" : "opening", quantity: delta, unitCost: d.purchasePrice, referenceType: "product", referenceId: pid, note: id ? "Correction depuis la fiche produit" : "Stock initial", userId: me.id, allowNegative: true });
        }
      }
    });
  } catch (e) {
    if (e instanceof StockConfigError) return { status: "error", message: "Aucun dépôt principal actif : définissez-en un avant de saisir le stock." };
    console.error("saveProductAction", e);
    return { status: "error", message: "Enregistrement impossible. Vérifiez les données et réessayez." };
  }
  refreshCatalog(slug);
  if (!id) return { status: "success", message: "Produit créé.", data: { id: String(savedId), ignored: String(ignored) } };
  return { status: "success", message: ignored ? `Produit enregistré. ${ignored} référence(s) liée(s) inconnue(s) ignorée(s).` : "Produit enregistré." };
}

const backTo = (v: FormDataEntryValue | null, fallback: string) => {
  const b = typeof v === "string" ? v : "";
  return /^\/admin\/produits(\/\d+)?(\?[\w\-=&%.+]*)?$/.test(b) ? b : fallback;
};
const withMsg = (url: string, key: "ok" | "erreur", msg: string) => `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;

/** Publier, dépublier (brouillon), archiver ou restaurer un produit. */
export async function setProductStatusAction(form: FormData) {
  const id = Number(form.get("id"));
  const status = z.enum(["draft", "published", "archived"]).parse(form.get("status"));
  const me = await assertStaff("products.update");
  const [before] = await db.select({ status: products.status, slug: products.slug }).from(products).where(eq(products.id, id));
  if (!before) return;
  // Publier exige « products.publish » ; retirer une publication aussi.
  if ((status === "published" || before.status === "published") && !me.can("products.publish")) {
    redirect(withMsg(backTo(form.get("back"), `/admin/produits/${id}`), "erreur", "Vous n'avez pas le droit de publier ou dépublier un produit."));
  }
  await db.update(products).set({ status, updatedAt: new Date() }).where(eq(products.id, id));
  await audit({ userId: me.id, module: "products", action: `status_${status}`, entityType: "product", entityId: id, oldValues: { status: before.status }, newValues: { status } });
  refreshCatalog(before.slug);
  const label = { draft: before.status === "archived" ? "Produit restauré (brouillon)" : "Produit dépublié", published: "Produit publié", archived: "Produit archivé" }[status];
  redirect(withMsg(backTo(form.get("back"), `/admin/produits/${id}`), "ok", label));
}

/** Duplique une fiche (brouillon) : caractéristiques, images et produits liés ; ni stock, ni code-barres. */
export async function duplicateProductAction(form: FormData) {
  const me = await assertStaff("products.create");
  const id = Number(form.get("id"));
  const newId = await db.transaction(async (tx) => {
    const [src] = await tx.select().from(products).where(eq(products.id, id));
    if (!src) return null;
    const base = `${src.sku}-COPIE`.slice(0, 54);
    const taken = new Set((await tx.select({ sku: products.sku }).from(products).where(sql`${products.sku} like ${base + "%"}`)).map((r) => r.sku));
    let sku = base;
    for (let n = 2; taken.has(sku); n++) sku = `${base}-${n}`;
    const name = `${src.name} (copie)`.slice(0, 200);
    let slug = slugify(`${name}-${sku}`).slice(0, 200);
    if ((await tx.select({ id: products.id }).from(products).where(eq(products.slug, slug))).length) slug = `${slug.slice(0, 190)}-${Date.now().toString(36)}`;
    const { id: _id, createdAt: _c, updatedAt: _u, searchVector: _s, ...rest } = src;
    void _id; void _c; void _u; void _s;
    const [created] = await tx
      .insert(products)
      .values({ ...rest, sku, slug, name, barcode: null, status: "draft", isFeatured: false })
      .returning({ id: products.id });
    const attrs = await tx.select().from(productAttributes).where(eq(productAttributes.productId, id));
    if (attrs.length) await tx.insert(productAttributes).values(attrs.map(({ id: _a, productId: _p, ...a }) => (void _a, void _p, { ...a, productId: created.id })));
    const imgs = await tx.select().from(productImages).where(eq(productImages.productId, id));
    // Même fichier partagé : il n'est supprimé du stockage que lorsqu'aucune fiche ne l'utilise plus.
    if (imgs.length) await tx.insert(productImages).values(imgs.map((i) => ({ productId: created.id, url: i.url, publicId: i.publicId, alt: i.alt, sortOrder: i.sortOrder, isPrimary: i.isPrimary })));
    const rels = await tx.select().from(productEquivalents).where(eq(productEquivalents.productId, id));
    if (rels.length) await tx.insert(productEquivalents).values(rels.map((r) => ({ ...r, productId: created.id }))).onConflictDoNothing();
    await audit({ userId: me.id, module: "products", action: "duplicate", entityType: "product", entityId: created.id, newValues: { from: id, sku } }, tx);
    return created.id;
  });
  if (!newId) redirect("/admin/produits?erreur=Produit introuvable");
  refreshCatalog();
  redirect(`/admin/produits/${newId}?ok=${encodeURIComponent("Copie créée en brouillon : vérifiez la référence et le nom.")}`);
}

const bulkSchema = z.object({
  op: z.enum(["publish", "unpublish", "archive", "restore", "activate", "deactivate", "category", "brand", "price", "vat"]),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  priceField: z.enum(["salePrice", "proPrice"]).optional(),
  pct: z.string().optional(),
  vatRate: z.enum(["0.00", "7.00", "13.00", "19.00"]).optional(),
});

/** Modification groupée de plusieurs produits (une seule transaction, journalisée). */
export async function bulkProductsAction(form: FormData) {
  const back = backTo(form.get("back"), "/admin/produits");
  const me = await assertStaff("products.update");
  const ids = [...new Set(form.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  const parsed = bulkSchema.safeParse(Object.fromEntries(form));
  if (!ids.length) redirect(withMsg(back, "erreur", "Cochez au moins un produit."));
  if (!parsed.success) redirect(withMsg(back, "erreur", "Action groupée invalide."));
  const d = parsed.data;
  const publishOps = ["publish", "unpublish"];
  if (publishOps.includes(d.op) && !me.can("products.publish")) redirect(withMsg(back, "erreur", "Vous n'avez pas le droit de publier ou dépublier."));

  let patch: Partial<typeof products.$inferInsert> | null = null;
  let priceSql: SQL | null = null;
  const nullableId = (v?: string) => (v === "" || v === "none" ? null : Number(v) || undefined);
  switch (d.op) {
    case "publish": patch = { status: "published" }; break;
    case "unpublish": patch = { status: "draft" }; break;
    case "archive": patch = { status: "archived" }; break;
    case "restore": patch = { status: "draft" }; break;
    case "activate": patch = { isActive: true }; break;
    case "deactivate": patch = { isActive: false }; break;
    case "vat": if (d.vatRate) patch = { vatRate: d.vatRate }; break;
    case "category": { const v = nullableId(d.categoryId); if (v !== undefined) patch = { categoryId: v }; break; }
    case "brand": { const v = nullableId(d.brandId); if (v !== undefined) patch = { brandId: v }; break; }
    case "price": {
      const pct = Number((d.pct ?? "").replace(",", "."));
      if (!d.priceField || !Number.isFinite(pct) || pct <= -100 || pct > 500 || pct === 0) redirect(withMsg(back, "erreur", "Indiquez une variation de prix en % (ex. 5 ou -10)."));
      const col = d.priceField === "proPrice" ? products.proPrice : products.salePrice;
      priceSql = sql`round(${col} * ${1 + pct / 100}::numeric, 3)`;
      break;
    }
  }
  if (!patch && !priceSql) redirect(withMsg(back, "erreur", "Choisissez la nouvelle valeur."));

  const n = await db.transaction(async (tx) => {
    const before = await tx.select({ id: products.id, slug: products.slug, status: products.status, isActive: products.isActive, categoryId: products.categoryId, brandId: products.brandId, salePrice: products.salePrice, proPrice: products.proPrice, vatRate: products.vatRate }).from(products).where(inArray(products.id, ids)).for("update");
    // On ne publie pas un produit archivé par une action groupée : il faut d'abord le restaurer.
    const targets = d.op === "publish" ? before.filter((b) => b.status !== "archived") : d.op === "restore" ? before.filter((b) => b.status === "archived") : before;
    if (!targets.length) return 0;
    const tIds = targets.map((t) => t.id);
    if (priceSql) {
      const col = d.priceField === "proPrice" ? "proPrice" : "salePrice";
      await tx.update(products).set({ [col]: priceSql, updatedAt: new Date() }).where(and(inArray(products.id, tIds), sql`${col === "proPrice" ? products.proPrice : products.salePrice} is not null`));
    } else {
      await tx.update(products).set({ ...patch!, updatedAt: new Date() }).where(inArray(products.id, tIds));
    }
    await audit({ userId: me.id, module: "products", action: `bulk_${d.op}`, entityType: "product", entityId: null, oldValues: { items: targets }, newValues: { ids: tIds, ...(patch ?? {}), ...(priceSql ? { field: d.priceField, pct: d.pct } : {}) } }, tx);
    return targets.length;
  });
  refreshCatalog();
  redirect(withMsg(back, n ? "ok" : "erreur", n ? `${n} produit(s) modifié(s).` : "Aucun produit concerné par cette action."));
}

/* ─── Images ───────────────────────────────────────────────────────── */

type ImageResult = { ok: true; message: string } | { ok: false; message: string };

async function productSlug(productId: number) {
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));
  return p?.slug ?? null;
}

/** Supprime le fichier du stockage s'il n'est plus utilisé par aucune fiche. */
async function releaseFile(url: string, publicId: string | null) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.url, url));
  if (n === 0) await deleteStoredImage(url, publicId);
}

/**
 * Ajoute une image (fichier ou adresse https) — ou remplace une image existante si `replaceId` est fourni.
 * Une requête par fichier : chaque fichier est vérifié (type réel, taille, dimensions) et optimisé en WebP.
 */
export async function uploadProductImageAction(form: FormData): Promise<ImageResult> {
  let me;
  try {
    me = await assertStaff("products.update");
  } catch (e) {
    return { ok: false, message: e instanceof AccessDenied ? e.message : "Accès refusé." };
  }
  const productId = Number(form.get("productId"));
  const replaceId = Number(form.get("replaceId")) || null;
  const file = form.get("file");
  const url = String(form.get("url") ?? "").trim();
  const alt = String(form.get("alt") ?? "").trim().slice(0, 200) || null;
  const slug = await productSlug(productId);
  if (!slug) return { ok: false, message: "Produit introuvable." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.productId, productId));
  if (!replaceId && n >= 20) return { ok: false, message: "20 images maximum par produit." };

  let stored: { url: string; publicId: string | null };
  try {
    if (file instanceof File && file.size > 0) stored = await uploadImage(file, `soger/produits/${productId}`);
    else if (/^https:\/\/[^\s"'<>]{4,500}$/i.test(url)) stored = { url, publicId: null };
    else return { ok: false, message: "Choisissez une image ou indiquez une adresse https://." };
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, message: e.message };
    console.error("uploadProductImageAction", e);
    return { ok: false, message: "Envoi impossible. Réessayez." };
  }

  if (replaceId) {
    const [old] = await db.select().from(productImages).where(and(eq(productImages.id, replaceId), eq(productImages.productId, productId)));
    if (!old) {
      await releaseFile(stored.url, stored.publicId);
      return { ok: false, message: "Image à remplacer introuvable." };
    }
    await db.update(productImages).set({ url: stored.url, publicId: stored.publicId, alt: alt ?? old.alt, updatedAt: new Date() }).where(eq(productImages.id, replaceId));
    await releaseFile(old.url, old.publicId);
    await audit({ userId: me.id, module: "products", action: "image_replace", entityType: "product", entityId: productId, oldValues: { imageId: replaceId, url: old.url }, newValues: { url: stored.url } });
  } else {
    const [img] = await db
      .insert(productImages)
      .values({ productId, url: stored.url, publicId: stored.publicId, alt, sortOrder: n, isPrimary: n === 0 })
      .returning({ id: productImages.id });
    await audit({ userId: me.id, module: "products", action: "add_image", entityType: "product", entityId: productId, newValues: { imageId: img.id, url: stored.url } });
  }
  refreshCatalog(slug);
  return { ok: true, message: replaceId ? "Image remplacée." : "Image ajoutée." };
}

const imagesSchema = z.object({
  productId: z.number().int().positive(),
  order: z.array(z.number().int().positive()).max(50),
  primaryId: z.number().int().positive().nullable(),
  alts: z.record(z.string(), z.string().max(200)).optional(),
});

/** Ordre, image principale et textes alternatifs, en une transaction. */
export async function saveProductImagesAction(input: z.input<typeof imagesSchema>): Promise<ImageResult> {
  let me;
  try {
    me = await assertStaff("products.update");
  } catch (e) {
    return { ok: false, message: e instanceof AccessDenied ? e.message : "Accès refusé." };
  }
  const parsed = imagesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Données invalides." };
  const d = parsed.data;
  await db.transaction(async (tx) => {
    const imgs = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, d.productId)).for("update");
    const own = new Set(imgs.map((i) => i.id));
    const order = [...d.order.filter((id) => own.has(id)), ...imgs.map((i) => i.id).filter((id) => !d.order.includes(id))];
    const primary = d.primaryId && own.has(d.primaryId) ? d.primaryId : order[0];
    for (const [i, imgId] of order.entries()) {
      const alt = d.alts?.[String(imgId)];
      await tx
        .update(productImages)
        .set({ sortOrder: i, isPrimary: imgId === primary, ...(alt !== undefined ? { alt: alt.trim() || null } : {}), updatedAt: new Date() })
        .where(eq(productImages.id, imgId));
    }
    await audit({ userId: me.id, module: "products", action: "images_update", entityType: "product", entityId: d.productId, newValues: { order, primary } }, tx);
  });
  refreshCatalog((await productSlug(d.productId)) ?? undefined);
  return { ok: true, message: "Images mises à jour." };
}

export async function deleteProductImageAction(imageId: number): Promise<ImageResult> {
  let me;
  try {
    me = await assertStaff("products.update");
  } catch (e) {
    return { ok: false, message: e instanceof AccessDenied ? e.message : "Accès refusé." };
  }
  const [img] = await db.select().from(productImages).where(eq(productImages.id, Number(imageId)));
  if (!img) return { ok: false, message: "Image introuvable." };
  await db.transaction(async (tx) => {
    await tx.delete(productImages).where(eq(productImages.id, img.id));
    if (img.isPrimary) {
      const [next] = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, img.productId)).orderBy(productImages.sortOrder).limit(1);
      if (next) await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, next.id));
    }
    await audit({ userId: me.id, module: "products", action: "image_delete", entityType: "product", entityId: img.productId, oldValues: { imageId: img.id, url: img.url } }, tx);
  });
  await releaseFile(img.url, img.publicId);
  refreshCatalog((await productSlug(img.productId)) ?? undefined);
  return { ok: true, message: "Image supprimée." };
}

/* ─── Catégories & marques ─────────────────────────────────────────── */

const categorySchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().max(80).optional(),
  sector: z.enum(["industrial", "agricultural"]),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(40).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isActive: z.literal("on").optional(),
});

export async function saveCategoryAction(form: FormData) {
  const raw = Object.fromEntries(form);
  const isNew = !raw.id;
  const me = await assertStaff(isNew ? "categories.create" : "categories.update");
  const d = categorySchema.parse(raw);
  const values = {
    name: d.name,
    slug: slugify(d.slug || d.name),
    sector: d.sector,
    description: d.description || null,
    icon: d.icon || null,
    imageUrl: d.imageUrl || null,
    sortOrder: d.sortOrder,
    isActive: !!d.isActive,
  };
  try {
    if (d.id) await db.update(categories).set(values).where(eq(categories.id, d.id));
    else await db.insert(categories).values(values);
  } catch {
    redirect(`/admin/categories?erreur=${encodeURIComponent("Ce nom d'URL (slug) est déjà utilisé.")}`);
  }
  await audit({ userId: me.id, module: "categories", action: isNew ? "create" : "update", entityType: "category", entityId: d.id ?? null, newValues: values });
  refreshCatalog();
  redirect("/admin/categories?ok=Catégorie enregistrée");
}

/**
 * Suppression d'une catégorie. Si des produits y sont rattachés, on demande
 * d'abord vers quelle catégorie les transférer (champ « transferTo »), puis
 * transfert + suppression dans une seule transaction.
 */
export async function deleteCategoryAction(form: FormData) {
  const me = await assertStaff("categories.delete");
  const id = Number(form.get("id"));
  const choice = String(form.get("transferTo") ?? "");
  // « archive » : la famille n'est plus vendue → produits archivés (retirés du site, gardés pour l'historique).
  const archive = choice === "archive";
  const target = archive ? null : Number(choice) || null;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.categoryId, id));
  if (n > 0 && !me.can("products.update")) redirect(`/admin/categories?erreur=${encodeURIComponent(`Impossible : ${n} produit(s) sont rattachés à cette catégorie et vous n'avez pas le droit de modifier les produits.`)}`);
  if (n > 0 && !target && !archive) redirect(`/admin/categories?supprimer=${id}`);
  if (target === id) redirect(`/admin/categories?supprimer=${id}&erreur=${encodeURIComponent("Choisissez une autre catégorie.")}`);
  if (target) {
    const [t] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, target));
    if (!t) redirect(`/admin/categories?supprimer=${id}&erreur=${encodeURIComponent("Catégorie de destination introuvable.")}`);
  }
  await db.transaction(async (tx) => {
    if (target) {
      await tx.update(products).set({ categoryId: target, updatedAt: new Date() }).where(eq(products.categoryId, id));
    } else if (archive && n > 0) {
      await tx.update(products).set({ categoryId: null, status: "archived", updatedAt: new Date() }).where(eq(products.categoryId, id));
    }
    await tx.delete(categories).where(eq(categories.id, id));
    await audit({ userId: me.id, module: "categories", action: "delete", entityType: "category", entityId: id, newValues: n ? (archive ? { productsArchived: n } : { productsMovedTo: target, count: n }) : undefined }, tx);
  });
  refreshCatalog();
  redirect(`/admin/categories?ok=${encodeURIComponent(!n ? "Catégorie supprimée" : archive ? `Catégorie supprimée — ${n} produit(s) archivé(s) et retiré(s) du site.` : `Catégorie supprimée — ${n} produit(s) transféré(s).`)}`);
}

const brandSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().trim().min(1).max(80),
  country: z.string().trim().max(60).optional(),
  logoUrl: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isActive: z.literal("on").optional(),
});

export async function saveBrandAction(form: FormData) {
  const raw = Object.fromEntries(form);
  const isNew = !raw.id;
  const me = await assertStaff(isNew ? "brands.create" : "brands.update");
  const d = brandSchema.parse(raw);
  const values = { name: d.name, slug: slugify(d.name), country: d.country || null, logoUrl: d.logoUrl || null, sortOrder: d.sortOrder, isActive: !!d.isActive };
  try {
    if (d.id) await db.update(brands).set(values).where(eq(brands.id, d.id));
    else await db.insert(brands).values(values);
  } catch {
    redirect(`/admin/marques?erreur=${encodeURIComponent("Cette marque existe déjà.")}`);
  }
  await audit({ userId: me.id, module: "brands", action: isNew ? "create" : "update", entityType: "brand", entityId: d.id ?? null, newValues: values });
  updateTag("brands");
  refreshCatalog();
  redirect("/admin/marques?ok=Marque enregistrée");
}

/**
 * Suppression d'une marque. Si des produits l'utilisent, on demande d'abord
 * vers quelle marque les transférer (ou « sans marque »), puis transfert +
 * suppression dans une seule transaction.
 */
export async function deleteBrandAction(form: FormData) {
  const me = await assertStaff("brands.delete");
  const id = Number(form.get("id"));
  const choice = String(form.get("transferTo") ?? "");
  const target = choice === "none" ? null : Number(choice) || undefined;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.brandId, id));
  if (n > 0 && !me.can("products.update")) redirect(`/admin/marques?erreur=${encodeURIComponent(`Impossible : ${n} produit(s) utilisent cette marque et vous n'avez pas le droit de modifier les produits.`)}`);
  if (n > 0 && target === undefined) redirect(`/admin/marques?supprimer=${id}`);
  if (target === id) redirect(`/admin/marques?supprimer=${id}&erreur=${encodeURIComponent("Choisissez une autre marque.")}`);
  if (target) {
    const [t] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, target));
    if (!t) redirect(`/admin/marques?supprimer=${id}&erreur=${encodeURIComponent("Marque de destination introuvable.")}`);
  }
  await db.transaction(async (tx) => {
    if (n > 0) {
      await tx.update(products).set({ brandId: target ?? null, updatedAt: new Date() }).where(eq(products.brandId, id));
    }
    await tx.delete(brands).where(eq(brands.id, id));
    await audit({ userId: me.id, module: "brands", action: "delete", entityType: "brand", entityId: id, newValues: n ? { productsMovedTo: target ?? null, count: n } : undefined }, tx);
  });
  updateTag("brands");
  refreshCatalog();
  redirect(`/admin/marques?ok=${encodeURIComponent(n ? `Marque supprimée — ${n} produit(s) transféré(s).` : "Marque supprimée")}`);
}
