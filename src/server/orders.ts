import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { customerPrices, customers, orderItems, orders, products, stock, warehouses } from "@/db/schema";
import { documentTotals, fmt3 } from "@/lib/totals";
import { applyStockMovement } from "./inventory";
import { nextDocumentNumber } from "./sequences";
import type { Tx } from "./audit";

export class BusinessError extends Error {}

/* ─── Prix ─────────────────────────────────────────────────────────── */

/**
 * Prix HT applicables à un client, relus en base :
 * prix négocié client > prix pro (client pro validé) > prix public.
 */
export async function priceProducts(tx: Tx, productIds: number[], customer?: { id: number; type: string; priceTier: string } | null) {
  if (!productIds.length) return new Map<number, PricedProduct>();
  const rows = await tx
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      unit: products.unit,
      salePrice: products.salePrice,
      proPrice: products.proPrice,
      purchasePrice: products.purchasePrice,
      vatRate: products.vatRate,
      status: products.status,
      isActive: products.isActive,
    })
    .from(products)
    .where(inArray(products.id, productIds));
  const negotiated = customer
    ? new Map(
        (await tx.select().from(customerPrices).where(and(eq(customerPrices.customerId, customer.id), inArray(customerPrices.productId, productIds)))).map(
          (r) => [r.productId, r.price],
        ),
      )
    : new Map<number, string>();
  const pro = !!customer && customer.type === "professional" && customer.priceTier === "professional";
  return new Map(
    rows.map((r) => {
      const price = negotiated.get(r.id) ?? (pro && r.proPrice ? r.proPrice : r.salePrice);
      return [r.id, { ...r, price: price == null ? null : Number(price), cost: r.purchasePrice == null ? null : Number(r.purchasePrice), vat: Number(r.vatRate) }];
    }),
  );
}
export type PricedProduct = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  price: number | null;
  cost: number | null;
  vat: number;
  status: string;
  isActive: boolean;
};

export async function defaultWarehouseId(tx: Tx) {
  const [w] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.isDefault, true));
  if (!w) throw new BusinessError("Aucun dépôt par défaut n'est configuré.");
  return w.id;
}

/** Retrouve un client existant (même e-mail ou téléphone, sans compte web) ou le crée. */
export async function findOrCreateCustomer(
  tx: Tx,
  c: { name: string; company?: string | null; phone: string; email?: string | null; address?: string | null; city?: string | null; governorate?: string | null; postalCode?: string | null; taxId?: string | null },
) {
  const conds = [c.email ? eq(customers.email, c.email.toLowerCase()) : undefined, eq(customers.phone, c.phone)].filter(Boolean);
  const [existing] = await tx
    .select()
    .from(customers)
    .where(and(sql`${customers.userId} is null`, or(...conds)))
    .limit(1);
  if (existing) return existing;
  const code = await nextDocumentNumber(tx, "customer");
  const [first, ...rest] = c.name.trim().split(/\s+/);
  const [created] = await tx
    .insert(customers)
    .values({
      code,
      type: c.company || c.taxId ? "professional" : "individual",
      companyName: c.company || null,
      firstName: first,
      lastName: rest.join(" ") || null,
      email: c.email?.toLowerCase() || null,
      phone: c.phone,
      taxId: c.taxId || null,
      address: c.address || null,
      city: c.city || null,
      governorate: c.governorate || null,
      postalCode: c.postalCode || null,
    })
    .returning();
  return created;
}

/* ─── Création de commande ─────────────────────────────────────────── */

export type OrderLineInput = {
  productId: number;
  quantity: number;
  /** Prix HT imposé (back-office, caisse). Sinon : prix client relu en base. */
  unitPrice?: number;
  discountRate?: number;
};

export async function createOrder(
  tx: Tx,
  input: {
    channel: "online" | "store" | "quote";
    customer: { id: number; type: string; priceTier: string } | null;
    lines: OrderLineInput[];
    status?: "pending" | "confirmed" | "delivered";
    paymentMethod?: "cash" | "card" | "transfer" | "check" | "cash_on_delivery" | "other" | null;
    deliveryMethod?: string | null;
    shipping?: { name?: string; phone?: string; address?: string; city?: string; governorate?: string; postalCode?: string; fee?: number };
    notes?: string | null;
    quoteId?: number | null;
    createdBy?: number | null;
    warehouseId?: number;
    cashSessionId?: number | null;
  },
) {
  if (!input.lines.length) throw new BusinessError("La commande ne contient aucun article.");
  const priced = await priceProducts(tx, [...new Set(input.lines.map((l) => l.productId))], input.customer);
  const lines = input.lines.map((l, i) => {
    const p = priced.get(l.productId);
    if (!p || (input.channel === "online" && (p.status !== "published" || !p.isActive))) throw new BusinessError("Un produit n'est plus disponible.");
    // Caisse : uniquement des produits actifs du catalogue (un produit archivé ou désactivé ne se vend plus).
    if (input.channel === "store" && (p.status === "archived" || !p.isActive)) throw new BusinessError(`« ${p.name} » est archivé ou désactivé : il ne peut plus être vendu.`);
    const unitPrice = l.unitPrice ?? p.price;
    if (unitPrice == null) throw new BusinessError(`« ${p.name} » est vendu sur devis uniquement.`);
    if (!(l.quantity > 0) || l.quantity > 99999) throw new BusinessError("Quantité invalide.");
    return { p, quantity: l.quantity, unitPrice, discountRate: Math.min(100, Math.max(0, l.discountRate ?? 0)), vatRate: p.vat, sortOrder: i };
  });
  const fee = input.shipping?.fee ?? 0;
  const t = documentTotals(lines, { shipping: fee, shippingVatRate: fee ? 19 : 0 });
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId(tx));
  const number = await nextDocumentNumber(tx, "order");

  const [order] = await tx
    .insert(orders)
    .values({
      number,
      channel: input.channel,
      customerId: input.customer?.id ?? null,
      quoteId: input.quoteId ?? null,
      warehouseId,
      status: "pending",
      paymentMethod: input.paymentMethod ?? null,
      deliveryMethod: input.deliveryMethod ?? null,
      shippingName: input.shipping?.name,
      shippingPhone: input.shipping?.phone,
      shippingAddress: input.shipping?.address,
      shippingCity: input.shipping?.city,
      shippingGovernorate: input.shipping?.governorate,
      shippingPostalCode: input.shipping?.postalCode,
      subtotal: fmt3(t.subtotal),
      discountTotal: fmt3(t.discountTotal),
      vatTotal: fmt3(t.vatTotal),
      shippingTotal: fmt3(t.shipping),
      total: fmt3(t.total),
      notes: input.notes ?? null,
      cashSessionId: input.cashSessionId ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  await tx.insert(orderItems).values(
    lines.map((l, i) => ({
      orderId: order.id,
      productId: l.p.id,
      sku: l.p.sku,
      description: l.p.name,
      quantity: String(l.quantity),
      unitPrice: fmt3(l.unitPrice),
      discountRate: String(l.discountRate),
      vatRate: String(l.vatRate),
      lineTotal: fmt3(t.lines[i].net),
      unitCost: l.p.cost == null ? null : fmt3(l.p.cost),
      sortOrder: l.sortOrder,
    })),
  );

  if (input.status === "confirmed" || input.status === "delivered") await confirmOrder(tx, order.id);
  if (input.status === "delivered") await deliverOrder(tx, order.id, input.createdBy ?? null);
  return { ...order, totals: t };
}

/* ─── Cycle de vie ─────────────────────────────────────────────────── */

async function lockOrder(tx: Tx, id: number) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
  if (!o) throw new BusinessError("Commande introuvable.");
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { o, items };
}

async function reserve(tx: Tx, warehouseId: number, items: { productId: number | null; quantity: string }[], sign: 1 | -1) {
  for (const it of items) {
    if (!it.productId) continue;
    await tx.insert(stock).values({ productId: it.productId, warehouseId }).onConflictDoNothing();
    await tx
      .update(stock)
      .set({ quantityReserved: sql`greatest(0, ${stock.quantityReserved} + ${sign * Number(it.quantity)}::numeric)`, updatedAt: new Date() })
      .where(and(eq(stock.productId, it.productId), eq(stock.warehouseId, warehouseId)));
  }
}

/** Confirmation : réserve le stock (sans mouvement physique). */
export async function confirmOrder(tx: Tx, id: number) {
  const { o, items } = await lockOrder(tx, id);
  if (o.status !== "pending") throw new BusinessError("Seule une commande en attente peut être confirmée.");
  await reserve(tx, o.warehouseId!, items, 1);
  await tx.update(orders).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(orders.id, id));
}

export async function setPreparing(tx: Tx, id: number) {
  const { o } = await lockOrder(tx, id);
  if (o.status !== "confirmed") throw new BusinessError("La commande doit être confirmée.");
  await tx.update(orders).set({ status: "preparing" }).where(eq(orders.id, id));
}

export async function setShipped(tx: Tx, id: number) {
  const { o } = await lockOrder(tx, id);
  if (!["confirmed", "preparing"].includes(o.status)) throw new BusinessError("La commande doit être confirmée ou en préparation.");
  await tx.update(orders).set({ status: "shipped" }).where(eq(orders.id, id));
}

/** Livraison / remise au client : sortie de stock tracée + libération de la réservation. */
export async function deliverOrder(tx: Tx, id: number, userId: number | null) {
  const { o, items } = await lockOrder(tx, id);
  if (!["confirmed", "preparing", "shipped"].includes(o.status)) throw new BusinessError("La commande doit être confirmée avant la livraison.");
  for (const it of items) {
    if (!it.productId) continue;
    await applyStockMovement(tx, {
      productId: it.productId,
      warehouseId: o.warehouseId!,
      type: "sale",
      quantity: -Number(it.quantity),
      unitCost: it.unitCost,
      referenceType: "order",
      referenceId: o.id,
      note: o.number,
      userId,
    });
  }
  await reserve(tx, o.warehouseId!, items, -1);
  await tx.update(orders).set({ status: "delivered", deliveredAt: new Date() }).where(eq(orders.id, id));
}

/** Annulation : libère la réservation (une commande livrée passe par un retour). */
export async function cancelOrder(tx: Tx, id: number) {
  const { o, items } = await lockOrder(tx, id);
  if (["delivered", "returned", "cancelled"].includes(o.status)) throw new BusinessError("Cette commande ne peut plus être annulée (utilisez un retour).");
  if (o.status !== "pending") await reserve(tx, o.warehouseId!, items, -1);
  await tx.update(orders).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(orders.id, id));
}

/** Retour client : remise en stock tracée, quantités retournées mises à jour. */
export async function returnOrderItems(tx: Tx, id: number, lines: { itemId: number; quantity: number }[], userId: number | null) {
  const { o, items } = await lockOrder(tx, id);
  if (o.status !== "delivered" && o.status !== "returned") throw new BusinessError("Seule une commande livrée peut faire l'objet d'un retour.");
  let any = false;
  for (const l of lines) {
    const it = items.find((i) => i.id === l.itemId);
    if (!it || !it.productId || !(l.quantity > 0)) continue;
    const remaining = Number(it.quantity) - Number(it.quantityReturned);
    if (l.quantity > remaining) throw new BusinessError(`Retour supérieur à la quantité livrée pour ${it.sku ?? it.description}.`);
    await applyStockMovement(tx, {
      productId: it.productId,
      warehouseId: o.warehouseId!,
      type: "customer_return",
      quantity: l.quantity,
      unitCost: it.unitCost,
      referenceType: "order",
      referenceId: o.id,
      note: `Retour ${o.number}`,
      userId,
    });
    await tx.update(orderItems).set({ quantityReturned: sql`${orderItems.quantityReturned} + ${l.quantity}::numeric` }).where(eq(orderItems.id, it.id));
    any = true;
  }
  if (!any) throw new BusinessError("Aucune quantité à retourner.");
  const refreshed = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
  if (refreshed.every((i) => Number(i.quantityReturned) >= Number(i.quantity))) {
    await tx.update(orders).set({ status: "returned" }).where(eq(orders.id, id));
  }
}
