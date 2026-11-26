"use client";

import { Check, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, switchLocalePath, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Adresse de la même page dans une autre langue (chemin + paramètres conservés). */
function useTargets() {
  const [loc, setLoc] = useState<{ path: string; search: string }>({ path: "/", search: "" });
  useEffect(() => {
    const sync = () => setLoc({ path: window.location.pathname, search: window.location.search });
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return (l: Locale) => `${switchLocalePath(loc.path, l)}${loc.search}`;
}

/**
 * Sélecteur de langue. Un lien classique (rechargement complet) pour que le sens
 * d'écriture (arabe de droite à gauche) et les polices soient appliqués partout.
 */
export function LanguageSwitcher({ variant = "menu", className }: { variant?: "menu" | "list"; className?: string }) {
  const { locale, t, fmt } = useI18n();
  const target = useTargets();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = (l: Locale) => (
    <a
      key={l}
      href={target(l)}
      hrefLang={l}
      lang={l}
      aria-current={l === locale ? "true" : undefined}
      title={fmt(t.lang.switchTo, { lang: LOCALE_NAMES[l].native })}
      onClick={() => {
        // Mémorise le choix (le serveur le relit pour les liens sans langue).
        document.cookie = `soger_lang=${l}; path=/; max-age=31536000; samesite=lax`;
      }}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
        l === locale ? "bg-mist font-semibold text-ink" : "text-graphite hover:bg-mist",
      )}
      data-testid={`lang-${l}`}
    >
      <span>{LOCALE_NAMES[l].native}</span>
      {l === locale && <Check className="size-4 text-accent" />}
    </a>
  );

  if (variant === "list") {
    return (
      <div className={cn("grid grid-cols-3 gap-1 rounded-xl border border-line p-1", className)} role="group" aria-label={t.lang.label}>
        {LOCALES.map((l) => (
          <a
            key={l}
            href={target(l)}
            hrefLang={l}
            lang={l}
            aria-current={l === locale ? "true" : undefined}
            onClick={() => { document.cookie = `soger_lang=${l}; path=/; max-age=31536000; samesite=lax`; }}
            className={cn("rounded-lg py-2 text-center text-sm font-medium", l === locale ? "bg-ink text-white" : "text-graphite hover:bg-mist")}
          >
            {LOCALE_NAMES[l].native}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.lang.label}
        className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-ink transition hover:bg-mist"
        data-testid="lang-button"
      >
        <Globe className="size-4 text-accent" aria-hidden />
        <span>{LOCALE_NAMES[locale].short}</span>
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-[calc(100%+6px)] z-50 w-44 rounded-xl border border-line bg-white p-1 shadow-lift">
          {LOCALES.map(item)}
        </div>
      )}
    </div>
  );
}
