"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { cart, type CartItem } from "@/lib/cart";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type CartProduct = Omit<CartItem, "quantity">;

/** Petit bouton icône (cartes produit). */
export function AddToCartIcon({ product, className }: { product: CartProduct; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Ajouter ${product.name} au panier`}
      onClick={() => {
        cart.add(product, 1);
        toast({ title: "Ajouté au panier", description: product.name, action: { href: "/panier", label: "Voir le panier" } });
      }}
      className={cn("grid size-9 place-items-center rounded-lg bg-accent text-white transition hover:bg-accent-hover active:scale-95", className)}
    >
      <ShoppingCart className="size-4" />
    </button>
  );
}

/** Sélecteur de quantité + bouton (fiche produit). */
export function AddToCartForm({ product }: { product: CartProduct }) {
  const [qty, setQty] = useState(1);
  const set = (n: number) => setQty(Math.min(9999, Math.max(1, Math.floor(n) || 1)));
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      <div className="flex h-12 items-center rounded-lg border border-line bg-white">
        <button type="button" onClick={() => set(qty - 1)} disabled={qty <= 1} aria-label="Diminuer la quantité" className="grid h-full w-11 place-items-center text-graphite hover:text-ink disabled:opacity-40">
          <Minus className="size-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={9999}
          value={qty}
          onChange={(e) => set(Number(e.target.value))}
          aria-label="Quantité"
          className="h-full w-14 [appearance:textfield] border-x border-line text-center text-sm font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => set(qty + 1)} aria-label="Augmenter la quantité" className="grid h-full w-11 place-items-center text-graphite hover:text-ink">
          <Plus className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          cart.add(product, qty);
          toast({ title: `${qty} × ajouté${qty > 1 ? "s" : ""} au panier`, description: product.name, action: { href: "/panier", label: "Voir le panier" } });
          setQty(1);
        }}
        className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-6 font-medium text-white shadow-[0_8px_20px_-8px_rgb(22_163_74/0.6)] transition hover:bg-accent-hover active:scale-[0.98]"
      >
        <ShoppingCart className="size-4" /> Ajouter au panier
      </button>
    </div>
  );
}
