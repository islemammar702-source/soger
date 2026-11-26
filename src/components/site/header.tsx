"use client";

import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FileText, LayoutDashboard, Menu, ShoppingCart, User, X } from "lucide-react";
import { Link, useI18n } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { useCartCount } from "@/lib/cart";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { SearchBox } from "./search-box";

const noop = () => () => {};

type NavCategory = { slug: string; name: string };

/**
 * Lit l'URL courante dans son propre <Suspense> : le reste du header peut ainsi
 * être pré-rendu statiquement, y compris sur les pages générées à la demande.
 */
function PathnameWatcher({ onChange }: { onChange: (p: string) => void }) {
  const pathname = usePathname();
  useEffect(() => onChange(pathname), [pathname, onChange]);
  return null;
}

/** Chemin sans la langue : « /ar/produits » → « /produits ». */
const stripLocale = (p: string) => {
  const parts = p.split("/");
  return isLocale(parts[1]) ? `/${parts.slice(2).join("/")}` : p;
};

export function Header({ categories }: { categories: NavCategory[] }) {
  const { t, dir, plural } = useI18n();
  const [pathname, setPathname] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const cartCount = useCartCount();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const rtl = dir === "rtl";

  const nav = [
    { href: "/", label: t.nav.home },
    { href: "/industrie", label: t.nav.industry },
    { href: "/agriculture", label: t.nav.agriculture },
    { href: "/marques", label: t.nav.brands },
    { href: "/a-propos", label: t.nav.about },
    { href: "/contact", label: t.nav.contact },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Ferme le menu mobile à chaque navigation.
  const onPathChange = useCallback((p: string) => {
    setPathname(stripLocale(p));
    setOpen(false);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  const isActive = (href: string) => !!pathname && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-white/90 backdrop-blur-xl transition-[box-shadow,border-color] duration-300 supports-[backdrop-filter]:bg-white/80",
        scrolled ? "border-line shadow-[0_8px_30px_-20px_rgb(17_24_39/0.35)]" : "border-transparent",
      )}
    >
      <Suspense fallback={null}>
        <PathnameWatcher onChange={onPathChange} />
      </Suspense>
      <div className="container-soger flex h-16 items-center gap-4 lg:h-[72px] lg:gap-8">
        <Logo />

        <nav aria-label={t.nav.mainAria} className="hidden items-center gap-1 xl:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "relative rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                isActive(item.href) ? "text-ink" : "text-steel hover:text-ink",
              )}
            >
              {item.label}
              {isActive(item.href) && (
                <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </Link>
          ))}
        </nav>

        <SearchBox className="ms-auto hidden max-w-md flex-1 md:block" />

        <div className="ms-auto flex items-center gap-1 md:ms-0">
          <Link
            href="/devis"
            className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink transition hover:bg-mist lg:flex"
          >
            <FileText className="size-4 text-accent" aria-hidden /> {t.nav.quote}
          </Link>
          <LanguageSwitcher className="hidden sm:block" />
          {/* Accès du personnel SOGER à la gestion (connexion administrateur). */}
          <Link
            href="/admin/connexion"
            prefetch={false}
            title={t.nav.admin}
            aria-label={t.nav.admin}
            className="hidden h-10 shrink-0 items-center gap-2 rounded-lg border border-line px-2.5 text-sm font-medium whitespace-nowrap text-ink transition hover:border-ink hover:bg-mist lg:flex"
          >
            <LayoutDashboard className="size-4 text-accent" aria-hidden />
          </Link>
          <Link href="/compte" aria-label={t.nav.account} className="grid size-10 place-items-center rounded-lg text-ink transition hover:bg-mist">
            <User className="size-5" strokeWidth={1.8} />
          </Link>
          <Link href="/panier" aria-label={cartCount ? plural(t.nav.cartCount, cartCount) : t.nav.cart} className="relative grid size-10 place-items-center rounded-lg text-ink transition hover:bg-mist">
            <ShoppingCart className="size-5" strokeWidth={1.8} />
            {cartCount > 0 && (
              <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white ring-2 ring-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t.nav.openMenu}
            aria-expanded={open}
            className="grid size-10 place-items-center rounded-lg text-ink transition hover:bg-mist xl:hidden"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* Recherche mobile */}
      <div className="container-soger pb-3 md:hidden">
        <SearchBox />
      </div>

      {/* Navigation secondaire : catégories industrielles */}
      <div
        className={cn(
          "hidden overflow-hidden border-t border-line/70 transition-[max-height,opacity] duration-300 md:block",
          scrolled ? "max-h-0 border-transparent opacity-0" : "max-h-12 opacity-100",
        )}
      >
        <nav aria-label={t.nav.categoriesAria} className="container-soger flex h-11 items-center gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_92%,transparent)] [scrollbar-width:none] rtl:[mask-image:linear-gradient(to_left,black_92%,transparent)]">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/categories/${c.slug}`}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                pathname === `/categories/${c.slug}` ? "bg-accent-soft text-accent-hover" : "text-steel hover:bg-mist hover:text-ink",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* Menu mobile (rendu dans <body> : le flou du header piégerait le positionnement fixe) */}
      {mounted && createPortal(
      <AnimatePresence>
        {open && (
          <div dir={dir}>
            <motion.div
              className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm xl:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={t.nav.menu}
              className="fixed inset-y-0 end-0 z-50 flex h-dvh w-[min(88vw,380px)] flex-col bg-white shadow-2xl xl:hidden"
              initial={{ x: rtl ? "-100%" : "100%" }}
              animate={{ x: 0 }}
              exit={{ x: rtl ? "-100%" : "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
            >
              <div className="flex h-16 items-center justify-between border-b border-line px-4">
                <Logo />
                <button type="button" onClick={() => setOpen(false)} aria-label={t.nav.closeMenu} className="grid size-10 place-items-center rounded-lg hover:bg-mist">
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <LanguageSwitcher variant="list" />
                <nav className="mt-3 flex flex-col">
                  {nav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-3 text-base font-medium",
                        isActive(item.href) ? "bg-mist text-ink" : "text-graphite",
                      )}
                    >
                      {item.label}
                      <ChevronRight className="size-4 text-steel rtl:rotate-180" />
                    </Link>
                  ))}
                </nav>
                <p className="mt-6 mb-2 px-3 text-xs font-semibold tracking-wider text-steel uppercase">{t.nav.industrialCategories}</p>
                <div className="grid grid-cols-2 gap-1">
                  {categories.map((c) => (
                    <Link key={c.slug} href={`/categories/${c.slug}`} className="rounded-lg px-3 py-2 text-sm text-graphite hover:bg-mist">
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="space-y-2 border-t border-line p-4">
                <Link href="/devis" className="flex h-12 items-center justify-center gap-2 rounded-lg bg-accent font-medium text-white">
                  <FileText className="size-4" /> {t.nav.requestQuote}
                </Link>
                <Link href="/admin/connexion" prefetch={false} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm font-medium text-ink">
                  <LayoutDashboard className="size-4 text-accent" /> {t.nav.adminMobile}
                </Link>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>,
      document.body)}
    </header>
  );
}
