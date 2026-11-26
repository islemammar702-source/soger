"use server";

import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { brands, categories, productAttributes, productEquivalents, productImages, products } from "@/db/schema";
import { slugify } from "@/lib/utils";
import { audit, diff } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { uploadImage } from "../uploads";
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
  equivalents: z.string().max(2000).optional(),
  compatibles: z.string().max(2000).optional(),
});

const attributesSchema = z
  .array(z.object({ key: z.string().trim().max(40), label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(120), unit: z.string().trim().max(20).optional() }))
  .max(40);

const fieldErrors = (e: z.ZodError) => z.flattenError(e).fieldErrors as Record<string, string[] | undefined>;
const denied = (e: unknown): FormState | null => (e instanceof AccessDenied ? { status: "error", message: e.message } : null);
const keyOf = (label: string) => slugify(label).replace(/-/g, "_").slice(0, 40) || "attr";

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
  if (d.status === "published" && !me.can("products.publish")) return { status: "error", message: "Vous n'avez pas le droit de publier un produit." };

  let attrs: z.infer<typeof attributesSchema> = [];
  try {
    attrs = attributesSchema.parse(JSON.parse(d.attributes || "[]"));
  } catch {
    return { status: "error", message: "Caractéristiques techniques invalides." };
  }

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
    purchasePrice: d.purchasePrice,
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
        await tx.update(products).set(values).where(eq(products.id, id));
        const changes = diff(before as unknown as Record<string, unknown>, values);
        if (changes.changed) await audit({ userId: me.id, module: "products", action: "update", entityType: "product", entityId: id, oldValues: changes.oldValues, newValues: changes.newValues }, tx);
      } else {
        const [created] = await tx.insert(products).values(values).returning({ id: products.id });
        savedId = created.id;
        await audit({ userId: me.id, module: "products", action: "create", entityType: "product", entityId: created.id, newValues: values }, tx);
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
    });
  } catch (e) {
    console.error("saveProductAction", e);
    return { status: "error", message: "Enregistrement impossible. Vérifiez les données et réessayez." };
  }
  refreshCatalog(slug);
  if (!id) redirect(`/admin/produits/${savedId}?ok=Produit créé`);
  return { status: "success", message: ignored ? `Produit enregistré. ${ignored} référence(s) liée(s) inconnue(s) ignorée(s).` : "Produit enregistré." };
}

export async function setProductStatusAction(form: FormData) {
  const id = Number(form.get("id"));
  const status = z.enum(["draft", "published", "archived"]).parse(form.get("status"));
  const me = await assertStaff(status === "published" ? "products.publish" : "products.update");
  const [before] = await db.select({ status: products.status, slug: products.slug }).from(products).where(eq(products.id, id));
  if (!before) return;
  await db.update(products).set({ status }).where(eq(products.id, id));
  await audit({ userId: me.id, module: "products", action: `status_${status}`, entityType: "product", entityId: id, oldValues: { status: before.status }, newValues: { status } });
  refreshCatalog(before.slug);
  redirect(`/admin/produits/${id}?ok=Statut mis à jour`);
}

/* ─── Images ───────────────────────────────────────────────────────── */

export async function addProductImageAction(_: FormState, form: FormData): Promise<FormState> {
  let me;
  try {
    me = await assertStaff("products.update");
  } catch (e) {
    return denied(e)!;
  }
  const productId = Number(form.get("productId"));
  const file = form.get("file");
  const url = String(form.get("url") ?? "").trim();
  let stored: { url: string; publicId: string | null };
  try {
    if (file instanceof File && file.size > 0) stored = await uploadImage(file, `soger/produits/${productId}`);
    else if (/^https:\/\/[^\s]+$/i.test(url)) stored = { url, publicId: null };
    else return { status: "error", message: "Choisissez une image ou indiquez une adresse https://." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Envoi impossible." };
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.productId, productId));
  const [img] = await db
    .insert(productImages)
    .values({ productId, url: stored.url, publicId: stored.publicId, alt: String(form.get("alt") ?? "") || null, sortOrder: n, isPrimary: n === 0 })
    .returning({ id: productImages.id });
  await audit({ userId: me.id, module: "products", action: "add_image", entityType: "product", entityId: productId, newValues: { imageId: img.id, url: stored.url } });
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));
  refreshCatalog(p?.slug);
  return { status: "success", message: "Image ajoutée." };
}

export async function imageAction(form: FormData) {
  const me = await assertStaff("products.update");
  const imageId = Number(form.get("imageId"));
  const op = String(form.get("op"));
  const [img] = await db.select().from(productImages).where(eq(productImages.id, imageId));
  if (!img) return;
  if (op === "delete") {
    await db.delete(productImages).where(eq(productImages.id, imageId));
    if (img.isPrimary) {
      const [next] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, img.productId)).orderBy(productImages.sortOrder).limit(1);
      if (next) await db.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, next.id));
    }
  } else if (op === "primary") {
    await db.transaction(async (tx) => {
      await tx.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, img.productId));
      await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, imageId));
    });
  }
  await audit({ userId: me.id, module: "products", action: `image_${op}`, entityType: "product", entityId: img.productId, oldValues: { imageId, url: img.url } });
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, img.productId));
  refreshCatalog(p?.slug);
  redirect(`/admin/produits/${img.productId}?ok=Images mises à jour#images`);
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

export async function deleteCategoryAction(form: FormData) {
  const me = await assertStaff("categories.delete");
  const id = Number(form.get("id"));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.categoryId, id));
  if (n > 0) redirect(`/admin/categories?erreur=${encodeURIComponent(`Impossible : ${n} produit(s) sont rattachés à cette catégorie. Désactivez-la plutôt.`)}`);
  await db.delete(categories).where(eq(categories.id, id));
  await audit({ userId: me.id, module: "categories", action: "delete", entityType: "category", entityId: id });
  refreshCatalog();
  redirect("/admin/categories?ok=Catégorie supprimée");
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

export async function deleteBrandAction(form: FormData) {
  const me = await assertStaff("brands.delete");
  const id = Number(form.get("id"));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.brandId, id));
  if (n > 0) redirect(`/admin/marques?erreur=${encodeURIComponent(`Impossible : ${n} produit(s) utilisent cette marque. Désactivez-la plutôt.`)}`);
  await db.delete(brands).where(eq(brands.id, id));
  await audit({ userId: me.id, module: "brands", action: "delete", entityType: "brand", entityId: id });
  updateTag("brands");
  redirect("/admin/marques?ok=Marque supprimée");
}
