import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format numérique français déterministe (« 12 345,500 »), identique côté serveur
 * et navigateur : Intl peut varier d'un moteur à l'autre (espace insécable fine ou non),
 * ce qui provoquait des erreurs d'hydratation.
 */
export function formatNumber(value: number, decimals = 0) {
  if (!Number.isFinite(value)) return "—";
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return `${value < 0 && Number(fixed) !== 0 ? "-" : ""}${grouped}${dec ? `,${dec}` : ""}`;
}

/** Format dinar tunisien : « 1 240,000 DT ». */
export function formatTND(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return `${formatNumber(Number(value), 3)} DT`;
}

/** Prix TTC à partir d'un prix HT et d'un taux de TVA (en %). */
export function withVat(ht: string | number, vatRate: string | number) {
  return Math.round(Number(ht) * (1 + Number(vatRate) / 100) * 1000) / 1000;
}

export function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Arrondi à 2 décimales : coordonnées SVG identiques côté serveur et navigateur. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Les images Cloudinary et locales passent par l'optimiseur Next ; les autres adresses sont servies telles quelles. */
export const isOptimizable = (url: string) => url.startsWith("/") || url.startsWith("https://res.cloudinary.com/");
