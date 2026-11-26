import Link from "next/link";
import Image from "next/image";
import { FileText, ShoppingCart } from "lucide-react";
import type { ProductCardData } from "@/server/catalog";
import { cn, formatTND, withVat } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

export function availabilityOf(p: Pick<ProductCardData, "available" | "minStock">) {
  const qty = Number(p.available);
  if (qty <= 0) return { label: "Sur commande", tone: "bg-steel/10 text-steel" } as const;
  if (qty <= Number(p.minStock)) return { label: "Stock limité", tone: "bg-amber-50 text-amber-700" } as const;
  return { label: "En stock", tone: "bg-accent-soft text-accent-hover" } as const;
}

export function ProductCard({ product, icon, layout = "grid" }: { product: ProductCardData; icon?: string | null; layout?: "grid" | "list" }) {
  const href = `/produits/${product.slug}`;
  const stock = availabilityOf(product);
  const price = product.salePrice ? withVat(product.salePrice, product.vatRate) : null;

  return (
    <article
      className={cn(
        "group relative flex overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-ink/15 hover:shadow-lift",
        layout === "grid" ? "flex-col" : "flex-row",
      )}
    >
      <Link
        href={href}
        className={cn(
          "relative block shrink-0 overflow-hidden bg-gradient-to-br from-mist to-white",
          layout === "grid" ? "aspect-[4/3]" : "w-36 sm:w-48",
        )}
        tabIndex={-1}
        aria-hidden
      >
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt="" fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-contain p-4 transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center">
            <CategoryIcon name={icon} className="size-14 text-steel/35 transition duration-500 group-hover:scale-110 group-hover:text-accent/60" />
          </div>
        )}
        {product.isNew && (
          <span className="absolute top-3 left-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white">Nouveau</span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium tracking-wide text-steel uppercase">
          <span className="truncate">{product.brandName}</span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 normal-case tracking-normal", stock.tone)}>{stock.label}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 font-sans text-[15px] leading-snug font-semibold tracking-normal text-ink">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">{product.name}</Link>
        </h3>
        <p className="mt-1 font-mono text-xs text-steel">Réf. {product.sku}</p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            {price !== null ? (
              <>
                <p className="font-display text-lg font-bold text-ink">{formatTND(price)}</p>
                <p className="text-[11px] text-steel">TTC / {product.unit}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-steel">Prix sur devis</p>
            )}
          </div>
          <div className="relative z-10 flex gap-1.5">
            <Link
              href={`/devis?produit=${encodeURIComponent(product.sku)}`}
              aria-label={`Demander un devis pour ${product.name}`}
              className="grid size-9 place-items-center rounded-lg border border-line text-graphite transition hover:border-ink/30 hover:bg-mist"
            >
              <FileText className="size-4" />
            </Link>
            <Link
              href={href}
              aria-label={`Commander ${product.name}`}
              className="grid size-9 place-items-center rounded-lg bg-accent text-white transition hover:bg-accent-hover"
            >
              <ShoppingCart className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
