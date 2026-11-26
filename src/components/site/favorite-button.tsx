"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/server/account-actions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

export function FavoriteButton({ productId, slug }: { productId: number; slug: string }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? t.product.removeFav : t.product.addFav}
      onClick={() =>
        start(async () => {
          const res = await toggleFavoriteAction(productId);
          if (res.login) return router.push(href(`/compte/connexion?suite=${encodeURIComponent(href(`/produits/${slug}`))}`));
          if (res.ok) {
            setFav(!!res.favorite);
            toast({ title: res.favorite ? t.product.addedFav : t.product.removedFav, action: res.favorite ? { href: "/compte/favoris", label: t.product.seeFavs } : undefined });
          }
        })
      }
      className={cn("grid size-10 place-items-center rounded-lg border border-line transition hover:bg-mist", fav ? "text-danger" : "text-steel")}
    >
      <Heart className={cn("size-5", fav && "fill-current")} />
    </button>
  );
}
