import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const tnd = new Intl.NumberFormat("fr-TN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** Format dinar tunisien : « 1 240,000 DT ». */
export function formatTND(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return `${tnd.format(Number(value))} DT`;
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
