"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

/**
 * Prix professionnel : ne s'affiche que pour un client pro validé.
 * Le cookie `soger_tier` n'est qu'un indice pour éviter des requêtes inutiles ;
 * le prix lui-même est calculé et vérifié par le serveur (/api/prix).
 */
type Entry = { ht: number; vat: number };
let pending: Set<number> | null = null;
const waiters = new Map<number, ((e: Entry | null) => void)[]>();

function request(id: number) {
  return new Promise<Entry | null>((resolve) => {
    waiters.set(id, [...(waiters.get(id) ?? []), resolve]);
    if (!pending) {
      pending = new Set();
      queueMicrotask(async () => {
        const ids = [...pending!];
        pending = null;
        let prices: Record<number, Entry> = {};
        try {
          const res = await fetch(`/api/prix?ids=${ids.join(",")}`);
          if (res.ok) {
            const data = await res.json();
            if (data.pro) prices = data.prices;
          }
        } catch {}
        for (const i of ids) {
          (waiters.get(i) ?? []).forEach((w) => w(prices[i] ?? null));
          waiters.delete(i);
        }
      });
    }
    pending.add(id);
  });
}

const isPro = () => typeof document !== "undefined" && document.cookie.split("; ").includes("soger_tier=pro");

export function ProPrice({ productId, publicHT, className }: { productId: number; publicHT: string | null; className?: string }) {
  const { t, fmt, money } = useI18n();
  const [entry, setEntry] = useState<Entry | null>(null);
  useEffect(() => {
    if (!isPro()) return;
    let alive = true;
    request(productId).then((e) => alive && setEntry(e));
    return () => {
      alive = false;
    };
  }, [productId]);
  if (!entry || (publicHT != null && Math.abs(entry.ht - Number(publicHT)) < 0.0005)) return null;
  return (
    <p className={className ?? "mt-1 inline-flex items-center gap-1.5 rounded-md bg-ink px-2 py-0.5 text-xs font-semibold text-white"}>
      {fmt(t.product.proPrice, { price: money(entry.ht) })}
    </p>
  );
}
