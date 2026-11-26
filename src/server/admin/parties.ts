"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { customerPrices, customers, productSuppliers, products, suppliers } from "@/db/schema";
import { audit, diff } from "../audit";
import { AccessDenied, assertStaff } from "../auth/dal";
import { notifyUser } from "../notify";
import { nextDocumentNumber } from "../sequences";
import type { FormState } from "../account-actions";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const fe = (e: z.ZodError) => z.flattenError(e).fieldErrors as Record<string, string[] | undefined>;
const deny = (e: unknown): FormState => ({ status: "error", message: e instanceof AccessDenied ? e.message : "Accès refusé" });

const customerSchema = z.object({
  type: z.enum(["individual", "professional"]),
  companyName: opt(160),
  firstName: opt(80),
  lastName: opt(80),
  email: z.union([z.literal(""), z.email("E-mail invalide")]).optional().transform((v) => v?.toLowerCase() || null),
  phone: opt(30),
  taxId: opt(40),
  activity: opt(120),
  address: opt(300),
  city: opt(80),
  governorate: opt(80),
  postalCode: opt(10),
  creditLimit: z.string().trim().optional().transform((v) => (v ? Number(v.replace(",", ".")).toFixed(3) : null)),
  notes: opt(2000),
  isActive: z.literal("on").optional(),
});

export async function saveCustomerAction(_: FormState, form: FormData): Promise<FormState> {
  const id = Number(form.get("id")) || null;
  let me;
  try {
    me = await assertStaff(id ? "customers.update" : "customers.create");
  } catch (e) {
    return deny(e);
  }
  const parsed = customerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Merci de corriger les champs.", fieldErrors: fe(parsed.error) };
  const d = parsed.data;
  if (!d.companyName && !d.lastName && !d.firstName) return { status: "error", message: "Indiquez un nom ou une raison sociale.", fieldErrors: { lastName: ["Obligatoire"] } };
  if (d.type === "professional" && !d.taxId) return { status: "error", message: "Le matricule fiscal est obligatoire pour un professionnel.", fieldErrors: { taxId: ["Obligatoire"] } };
  const values = { ...d, isActive: !!d.isActive };
  let savedId = id;
  await db.transaction(async (tx) => {
    if (id) {
      const [before] = await tx.select().from(customers).where(eq(customers.id, id));
      await tx.update(customers).set(values).where(eq(customers.id, id));
      const ch = diff(before as unknown as Record<string, unknown>, values);
      if (ch.changed) await audit({ userId: me.id, module: "customers", action: "update", entityType: "customer", entityId: id, oldValues: ch.oldValues, newValues: ch.newValues }, tx);
    } else {
      const code = await nextDocumentNumber(tx, "customer");
      const [c] = await tx.insert(customers).values({ ...values, code }).returning({ id: customers.id });
      savedId = c.id;
      await audit({ userId: me.id, module: "customers", action: "create", entityType: "customer", entityId: c.id, newValues: values }, tx);
    }
  });
  if (!id) redirect(`/admin/clients/${savedId}?ok=Client créé`);
  return { status: "success", message: "Fiche client enregistrée." };
}

/** Validation (ou retrait) des tarifs professionnels d'un client. */
export async function setPriceTierAction(form: FormData) {
  const me = await assertStaff("customers.update");
  const id = Number(form.get("id"));
  const tier = z.enum(["retail", "professional"]).parse(form.get("tier"));
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) redirect("/admin/clients");
  if (tier === "professional" && (c.type !== "professional" || !c.taxId)) redirect(`/admin/clients/${id}?erreur=${encodeURIComponent("Renseignez le type professionnel et le matricule fiscal avant de valider.")}`);
  await db.transaction(async (tx) => {
    await tx.update(customers).set({ priceTier: tier }).where(eq(customers.id, id));
    await audit({ userId: me.id, module: "customers", action: tier === "professional" ? "approve_pro" : "revoke_pro", entityType: "customer", entityId: id, oldValues: { priceTier: c.priceTier }, newValues: { priceTier: tier } }, tx);
    if (tier === "professional") await notifyUser(tx, c.userId, { type: "pro_approved", title: "Votre compte professionnel est validé", body: "Vos tarifs professionnels sont visibles dès votre prochaine connexion.", link: "/compte" });
  });
  redirect(`/admin/clients/${id}?ok=${encodeURIComponent(tier === "professional" ? "Tarifs professionnels activés" : "Tarifs professionnels retirés")}`);
}

export async function setCustomerPriceAction(form: FormData) {
  const me = await assertStaff("customers.update");
  const customerId = Number(form.get("customerId"));
  const sku = String(form.get("sku") ?? "").trim().toUpperCase();
  const price = Number(String(form.get("price") ?? "").replace(",", "."));
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku));
  if (!p || !(price >= 0)) redirect(`/admin/clients/${customerId}?erreur=${encodeURIComponent(!p ? `Référence inconnue : ${sku}` : "Prix invalide")}#prix`);
  await db
    .insert(customerPrices)
    .values({ customerId, productId: p.id, price: price.toFixed(3) })
    .onConflictDoUpdate({ target: [customerPrices.customerId, customerPrices.productId], set: { price: price.toFixed(3), updatedAt: new Date() } });
  await audit({ userId: me.id, module: "customers", action: "set_price", entityType: "customer", entityId: customerId, newValues: { sku, price } });
  redirect(`/admin/clients/${customerId}?ok=Prix négocié enregistré#prix`);
}

export async function removeCustomerPriceAction(form: FormData) {
  const me = await assertStaff("customers.update");
  const customerId = Number(form.get("customerId"));
  const productId = Number(form.get("productId"));
  await db.delete(customerPrices).where(and(eq(customerPrices.customerId, customerId), eq(customerPrices.productId, productId)));
  await audit({ userId: me.id, module: "customers", action: "remove_price", entityType: "customer", entityId: customerId, oldValues: { productId } });
  redirect(`/admin/clients/${customerId}?ok=Prix négocié supprimé#prix`);
}

/* ─── Fournisseurs ─────────────────────────────────────────────────── */

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Nom obligatoire").max(160),
  contactName: opt(120),
  email: z.union([z.literal(""), z.email("E-mail invalide")]).optional().transform((v) => v?.toLowerCase() || null),
  phone: opt(30),
  taxId: opt(40),
  address: opt(300),
  city: opt(80),
  country: z.string().trim().min(2).max(60),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  notes: opt(2000),
  isActive: z.literal("on").optional(),
});

export async function saveSupplierAction(_: FormState, form: FormData): Promise<FormState> {
  const id = Number(form.get("id")) || null;
  let me;
  try {
    me = await assertStaff(id ? "suppliers.update" : "suppliers.create");
  } catch (e) {
    return deny(e);
  }
  const parsed = supplierSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Merci de corriger les champs.", fieldErrors: fe(parsed.error) };
  const values = { ...parsed.data, isActive: !!parsed.data.isActive };
  let savedId = id;
  await db.transaction(async (tx) => {
    if (id) {
      const [before] = await tx.select().from(suppliers).where(eq(suppliers.id, id));
      await tx.update(suppliers).set(values).where(eq(suppliers.id, id));
      const ch = diff(before as unknown as Record<string, unknown>, values);
      if (ch.changed) await audit({ userId: me.id, module: "suppliers", action: "update", entityType: "supplier", entityId: id, oldValues: ch.oldValues, newValues: ch.newValues }, tx);
    } else {
      const code = await nextDocumentNumber(tx, "supplier");
      const [s] = await tx.insert(suppliers).values({ ...values, code }).returning({ id: suppliers.id });
      savedId = s.id;
      await audit({ userId: me.id, module: "suppliers", action: "create", entityType: "supplier", entityId: s.id, newValues: values }, tx);
    }
  });
  if (!id) redirect(`/admin/fournisseurs/${savedId}?ok=Fournisseur créé`);
  return { status: "success", message: "Fiche fournisseur enregistrée." };
}

export async function setSupplierProductAction(form: FormData) {
  const me = await assertStaff("suppliers.update");
  const supplierId = Number(form.get("supplierId"));
  const sku = String(form.get("sku") ?? "").trim().toUpperCase();
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku));
  if (!p) redirect(`/admin/fournisseurs/${supplierId}?erreur=${encodeURIComponent(`Référence inconnue : ${sku}`)}#produits`);
  const price = String(form.get("price") ?? "").replace(",", ".");
  const values = {
    supplierRef: String(form.get("supplierRef") ?? "").trim() || null,
    purchasePrice: price && Number(price) >= 0 ? Number(price).toFixed(3) : null,
    leadTimeDays: Number(form.get("leadTimeDays")) || null,
    isPreferred: form.get("isPreferred") === "on",
  };
  await db.insert(productSuppliers).values({ productId: p.id, supplierId, ...values }).onConflictDoUpdate({ target: [productSuppliers.productId, productSuppliers.supplierId], set: { ...values, updatedAt: new Date() } });
  await audit({ userId: me.id, module: "suppliers", action: "set_product", entityType: "supplier", entityId: supplierId, newValues: { sku, ...values } });
  redirect(`/admin/fournisseurs/${supplierId}?ok=Produit fournisseur enregistré#produits`);
}

export async function removeSupplierProductAction(form: FormData) {
  const me = await assertStaff("suppliers.update");
  const supplierId = Number(form.get("supplierId"));
  const productId = Number(form.get("productId"));
  await db.delete(productSuppliers).where(and(eq(productSuppliers.supplierId, supplierId), eq(productSuppliers.productId, productId)));
  await audit({ userId: me.id, module: "suppliers", action: "remove_product", entityType: "supplier", entityId: supplierId, oldValues: { productId } });
  redirect(`/admin/fournisseurs/${supplierId}?ok=Produit retiré#produits`);
}
