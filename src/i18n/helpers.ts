import { formatNumber } from "@/lib/utils";
import { dirOf, INTL_LOCALE, localizePath, type Locale } from "./config";
import { fmt, plural, type Plural } from "./format";
import type { Dict } from "./dictionaries/fr";

type StatusKind = "order" | "payment" | "quote" | "invoice" | "method";

/** Outils de traduction liés à une langue (utilisables côté serveur et navigateur). */
export function createI18n(locale: Locale, t: Dict) {
  const intl = INTL_LOCALE[locale];
  const tz = "Africa/Tunis";
  const dateFmt = new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz, numberingSystem: "latn" });
  const dateTimeFmt = new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz, numberingSystem: "latn" });
  return {
    locale,
    dir: dirOf(locale),
    t,
    /** Chemin interne avec la langue : « /produits » → « /en/produits ». */
    href: (path: string) => localizePath(path, locale),
    fmt,
    plural: (forms: Plural, n: number, vars?: Record<string, string | number>) => plural(locale, forms, n, vars),
    /** Montant en dinars, format identique serveur / navigateur. */
    money: (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : `${formatNumber(Number(v), 3)} ${t.common.currency}`),
    date: (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—"),
    dateTime: (d: Date | string | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "—"),
    /** Libellés de catalogue enregistrés en français dans la base. */
    category: (slug: string | null | undefined, fallback: string | null | undefined) => (slug && t.categories[slug]?.name) || fallback || "",
    categoryDescription: (slug: string | null | undefined, fallback: string | null | undefined) => (slug && t.categories[slug]?.description) || fallback || "",
    attribute: (label: string) => t.attributes[label] ?? label,
    unit: (unit: string | null | undefined) => (unit ? t.units[unit] ?? unit : ""),
    status: (kind: StatusKind, key: string | null | undefined) => (key ? (t.status[kind] as Record<string, string>)[key] ?? key : "—"),
    deliveryMethod: (v: string | null | undefined) => (v ? t.status.deliveryMethod[v] ?? v : "—"),
    /** Message renvoyé par le serveur (rédigé en français). */
    message: (fr: string | null | undefined) => (fr ? t.messages[fr] ?? fr : ""),
  };
}

export type I18n = ReturnType<typeof createI18n>;
