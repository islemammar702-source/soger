import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function PageHero({ title, description, crumbs = [], children }: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: { href: string; label: string }[];
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-ink text-white">
      <div className="bg-blueprint absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="absolute -top-40 right-0 -z-10 size-[420px] rounded-full bg-accent/15 blur-[100px]" />
      <div className="container-soger py-10 sm:py-14">
        <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1 text-xs text-white/50">
          <Link href="/" className="hover:text-white">Accueil</Link>
          {crumbs.map((c) => (
            <span key={c.href} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
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
