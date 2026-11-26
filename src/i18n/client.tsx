"use client";

import NextLink from "next/link";
import { createContext, useContext, useMemo, type ComponentProps } from "react";
import { DEFAULT_LOCALE, localizePath, type Locale } from "./config";
import fr, { type Dict } from "./dictionaries/fr";
import { createI18n, type I18n } from "./helpers";

const Ctx = createContext<I18n>(createI18n(DEFAULT_LOCALE, fr));

/** Fournit la langue et le dictionnaire aux composants du navigateur. */
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: React.ReactNode }) {
  const value = useMemo(() => createI18n(locale, dict), [locale, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Traductions dans un composant navigateur (français par défaut, ex. dans l'espace gestion). */
export const useI18n = () => useContext(Ctx);

/** Lien interne qui conserve la langue courante (« /produits » → « /ar/produits »). */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const { locale } = useI18n();
  return <NextLink href={typeof href === "string" ? localizePath(href, locale) : href} {...props} />;
}
