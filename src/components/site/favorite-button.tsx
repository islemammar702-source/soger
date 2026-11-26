"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/server/account-actions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function FavoriteButton({ productId, slug }: { productId: number; slug: string }) {
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
      onClick={() =>
        start(async () => {
          const res = await toggleFavoriteAction(productId);
          if (res.login) return router.push(`/compte/connexion?suite=/produits/${slug}`);
          if (res.ok) {
            setFav(!!res.favorite);
            toast({ title: res.favorite ? "Ajouté aux favoris" : "Retiré des favoris", action: res.favorite ? { href: "/compte/favoris", label: "Voir mes favoris" } : undefined });
          }
        })
      }
      className={cn("grid size-10 place-items-center rounded-lg border border-line transition hover:bg-mist", fav ? "text-danger" : "text-steel")}
    >
      <Heart className={cn("size-5", fav && "fill-current")} />
    </button>
  );
}
