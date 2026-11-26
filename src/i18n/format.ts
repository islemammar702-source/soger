import { INTL_LOCALE, type Locale } from "./config";

/** Formes plurielles (règles CLDR : l'arabe en a six). */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };

/** « {n} produits » → remplace les {variables}. */
export function fmt(s: string, vars: Record<string, string | number> = {}) {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const rulesCache = new Map<Locale, Intl.PluralRules>();
export function plural(locale: Locale, forms: Plural, n: number, vars: Record<string, string | number> = {}) {
  let rules = rulesCache.get(locale);
  if (!rules) rulesCache.set(locale, (rules = new Intl.PluralRules(INTL_LOCALE[locale])));
  const cat = (n === 0 && forms.zero ? "zero" : rules.select(n)) as keyof Plural;
  return fmt(forms[cat] ?? forms.other, { n, ...vars });
}
