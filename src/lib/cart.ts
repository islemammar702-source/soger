"use client";

import { useSyncExternalStore } from "react";

/**
 * Panier côté navigateur (localStorage), partagé entre les onglets.
 * Les prix stockés ici servent uniquement à l'affichage : le serveur
 * recalcule toujours les prix depuis la base avant tout devis ou commande.
 */
export type CartItem = {
  productId: number;
  slug: string;
  sku: string;
  name: string;
  brandName: string | null;
  unit: string;
  /** Prix unitaire HT au moment de l'ajout (affichage). */
  unitPrice: string | null;
  vatRate: string;
  icon: string | null;
  imageUrl: string | null;
  quantity: number;
};

const KEY = "soger.cart.v1";
const MAX_QTY = 9999;
const EMPTY: CartItem[] = [];

let cache: CartItem[] | null = null;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    cache = Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.productId === "number" && i.quantity > 0) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: CartItem[]) {
  cache = items;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* stockage indisponible (navigation privée) : le panier reste en mémoire */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const clamp = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.floor(n) || 1));

export const cart = {
  add(item: Omit<CartItem, "quantity">, quantity = 1) {
    const items = read();
    const existing = items.find((i) => i.productId === item.productId);
    write(
      existing
        ? items.map((i) => (i.productId === item.productId ? { ...i, ...item, quantity: clamp(i.quantity + quantity) } : i))
        : [...items, { ...item, quantity: clamp(quantity) }],
    );
  },
  setQuantity(productId: number, quantity: number) {
    write(read().map((i) => (i.productId === productId ? { ...i, quantity: clamp(quantity) } : i)));
  },
  remove(productId: number) {
    write(read().filter((i) => i.productId !== productId));
  },
  clear() {
    write([]);
  },
  /** Met à jour prix / noms après revalidation serveur, retire les produits disparus. */
  sync(fresh: Map<number, Partial<CartItem>>) {
    write(read().filter((i) => fresh.has(i.productId)).map((i) => ({ ...i, ...fresh.get(i.productId) })));
  },
};

export function useCart() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useCartCount() {
  const items = useCart();
  return items.reduce((n, i) => n + i.quantity, 0);
}

export function cartTotals(items: CartItem[]) {
  const byRate = new Map<string, { base: number; vat: number }>();
  let subtotal = 0;
  for (const i of items) {
    if (i.unitPrice == null) continue;
    const line = Number(i.unitPrice) * i.quantity;
    subtotal += line;
    const r = byRate.get(i.vatRate) ?? { base: 0, vat: 0 };
    r.base += line;
    r.vat += (line * Number(i.vatRate)) / 100;
    byRate.set(i.vatRate, r);
  }
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const vat = [...byRate.entries()].map(([rate, v]) => ({ rate, base: round(v.base), vat: round(v.vat) }));
  const vatTotal = round(vat.reduce((s, v) => s + v.vat, 0));
  return {
    subtotal: round(subtotal),
    vat,
    vatTotal,
    total: round(subtotal + vatTotal),
    hasPriceOnRequest: items.some((i) => i.unitPrice == null),
  };
}
