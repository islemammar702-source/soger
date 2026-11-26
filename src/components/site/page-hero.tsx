import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";

export async function PageHero({ title, description, crumbs = [], children }: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: { href: string; label: string }[];
  children?: ReactNode;
}) {
  const { t } = await getI18n();
  return (
    <section className="relative isolate overflow-hidden bg-ink text-white">
      <div className="bg-blueprint absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="absolute -top-40 end-0 -z-10 size-[420px] rounded-full bg-accent/15 blur-[100px]" />
      <div className="container-soger py-10 sm:py-14">
        <nav aria-label={t.common.breadcrumb} className="flex flex-wrap items-center gap-1 text-xs text-white/50">
          <Link href="/" className="hover:text-white">{t.nav.home}</Link>
          {crumbs.map((c) => (
            <span key={c.href} className="flex items-center gap-1">
              <ChevronRight className="size-3 rtl:rotate-180" />
              <Link href={c.href} className="hover:text-white">{c.label}</Link>
            </span>
          ))}
        </nav>
        <h1 className="metal-text mt-4 text-3xl font-bold sm:text-4xl lg:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-white/60">{description}</p>}
        {children}
      </div>
    </section>
  );
}
