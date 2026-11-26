/** Langues du site public. L'espace gestion et les documents (factures, devis) restent en français. */
export const LOCALES = ["fr", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "soger_lang";

export const isLocale = (v: string | null | undefined): v is Locale => !!v && (LOCALES as readonly string[]).includes(v);
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

/** Nom de chaque langue dans sa propre langue (sélecteur). */
export const LOCALE_NAMES: Record<Locale, { native: string; short: string }> = {
  fr: { native: "Français", short: "FR" },
  en: { native: "English", short: "EN" },
  ar: { native: "العربية", short: "ع" },
};

/** Balises pour Intl et les métadonnées. */
export const INTL_LOCALE: Record<Locale, string> = { fr: "fr-TN", en: "en-GB", ar: "ar-TN" };
export const OG_LOCALE: Record<Locale, string> = { fr: "fr_TN", en: "en_GB", ar: "ar_TN" };

/** Chemins qui ne sont jamais préfixés par une langue. */
export const UNLOCALIZED = /^\/(admin|api|media|documents|_next)(\/|$)/;

/** Ajoute la langue à un chemin interne : « /produits » → « /ar/produits ». */
export function localizePath(path: string, locale: Locale) {
  if (!path.startsWith("/") || path.startsWith("//") || UNLOCALIZED.test(path)) return path;
  const first = path.split(/[/?#]/)[1];
  if (isLocale(first)) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Remplace la langue d'un chemin déjà localisé. */
export function switchLocalePath(pathname: string, locale: Locale) {
  const parts = pathname.split("/");
  if (isLocale(parts[1])) parts[1] = locale;
  else parts.splice(1, 0, locale);
  return parts.join("/") || `/${locale}`;
}

/** Langue préférée d'après l'en-tête Accept-Language. */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const r of ranked) if (isLocale(r.lang)) return r.lang;
  return DEFAULT_LOCALE;
}
