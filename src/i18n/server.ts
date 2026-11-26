import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isLocale, type Locale } from "./config";
import { DICTIONARIES } from "./dictionaries";
import { createI18n } from "./helpers";

/** Langue de la page en cours (segment /[lang] de l'adresse). */
export async function getLocale(): Promise<Locale> {
  const l = await lang();
  if (!isLocale(l)) notFound();
  return l;
}

const forLocale = cache((locale: Locale) => createI18n(locale, DICTIONARIES[locale]));

/** Traductions et outils de mise en forme de la page en cours (composants serveur). */
export async function getI18n() {
  return forLocale(await getLocale());
}
