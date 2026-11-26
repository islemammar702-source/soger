import { Suspense, type ReactNode } from "react";
import { Bell, FileText, Heart, LayoutDashboard, LogOut, Package, Receipt, UserRound } from "lucide-react";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { logoutAction } from "@/server/account-actions";
import { PageHero } from "./page-hero";

/** Gabarit de l'espace client. Le contenu (qui lit la session) est rendu dans un <Suspense>. */
export async function AccountShell({ title, current, children }: { title: string; current: string; children: ReactNode }) {
  const { t, locale } = await getI18n();
  const n = t.account.nav;
  const NAV = [
    { href: "/compte", label: n.dashboard, icon: LayoutDashboard },
    { href: "/compte/commandes", label: n.orders, icon: Package },
    { href: "/compte/devis", label: n.quotes, icon: FileText },
    { href: "/compte/factures", label: n.invoices, icon: Receipt },
    { href: "/compte/favoris", label: n.favorites, icon: Heart },
    { href: "/compte/notifications", label: n.notifications, icon: Bell },
    { href: "/compte/profil", label: n.profile, icon: UserRound },
  ];
  return (
    <>
      <PageHero title={title} crumbs={[{ href: "/compte", label: t.account.area }, ...(current !== "/compte" ? [{ href: current, label: title }] : [])]} />
      <section className="container-soger grid gap-8 py-10 lg:grid-cols-[230px_1fr] lg:py-14">
        <nav aria-label={t.account.area} className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={current === href ? "page" : undefined}
              className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-graphite transition hover:bg-mist aria-[current=page]:bg-ink aria-[current=page]:text-white"
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
          <form action={logoutAction} className="shrink-0 lg:mt-4 lg:border-t lg:border-line lg:pt-4">
            <input type="hidden" name="area" value="customer" />
            <input type="hidden" name="lang" value={locale} />
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-steel transition hover:bg-mist hover:text-danger">
              <LogOut className="size-4 rtl:rotate-180" /> {t.account.logout}
            </button>
          </form>
        </nav>
        <div className="min-w-0">
          <Suspense fallback={<div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-[var(--radius-card)] bg-mist" />)}</div>}>
            {children}
          </Suspense>
        </div>
      </section>
    </>
  );
}

export function EmptyState({ title, text, href, cta }: { title: string; text?: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line py-14 text-center">
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-steel">{text}</p>}
      {href && cta && <Link href={href} className="mt-4 inline-block text-sm font-semibold text-accent">{cta} <span className="inline-block rtl:rotate-180">→</span></Link>}
    </div>
  );
}
