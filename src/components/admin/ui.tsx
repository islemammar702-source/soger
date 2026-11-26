import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Petits composants serveur du back-office : en-têtes, cartes, tableaux, pagination. */

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-steel hover:text-ink">
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        )}
        <h1 className="truncate font-display text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-steel">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn("rounded-xl border border-line bg-white", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, sub, tone, href, icon }: { label: string; value: string; sub?: ReactNode; tone?: "default" | "warning" | "danger" | "success"; href?: string; icon?: ReactNode }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-steel uppercase">{label}</p>
        {icon && <span className="text-steel">{icon}</span>}
      </div>
      <p className={cn("mt-2 font-display text-2xl font-bold", tone === "danger" && "text-danger", tone === "warning" && "text-amber-700", tone === "success" && "text-accent-hover")}>{value}</p>
      {sub && <div className="mt-1 text-xs text-steel">{sub}</div>}
    </>
  );
  const cls = "block rounded-xl border border-line bg-white p-4 transition";
  return href ? <Link href={href} className={cn(cls, "hover:border-ink/20 hover:shadow-soft")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Table({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cn("border-b border-line bg-mist/60 px-4 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-steel uppercase", className)}>{children}</th>
);
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cn("border-b border-line px-4 py-3 align-middle", className)}>{children}</td>
);
export const EmptyRow = ({ colSpan, children = "Aucun résultat" }: { colSpan: number; children?: ReactNode }) => (
  <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-steel">{children}</td></tr>
);

/** Barre de recherche/filtres en GET : l'état est dans l'URL (partageable, bouton retour). */
export function FilterBar({ action, children, q, placeholder = "Rechercher…" }: { action: string; children?: ReactNode; q?: string; placeholder?: string }) {
  return (
    <form action={action} className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" />
        <input name="q" defaultValue={q} placeholder={placeholder} className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10" />
      </div>
      {children}
      <button className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-graphite">Filtrer</button>
    </form>
  );
}

export function FilterSelect({ name, value, options, label }: { name: string; value?: string; options: [string, string][]; label: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label} className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent">
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (p: number) => string }) {
  if (pageCount <= 1) return null;
  const btn = "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-steel">
      <span>Page {page} / {pageCount}</span>
      <div className="flex gap-1">
        {page > 1 ? <Link href={href(page - 1)} className={cn(btn, "hover:bg-mist")} aria-label="Page précédente"><ChevronLeft className="size-4" /></Link> : <span className={cn(btn, "opacity-40")}><ChevronLeft className="size-4" /></span>}
        {page < pageCount ? <Link href={href(page + 1)} className={cn(btn, "hover:bg-mist")} aria-label="Page suivante"><ChevronRight className="size-4" /></Link> : <span className={cn(btn, "opacity-40")}><ChevronRight className="size-4" /></span>}
      </div>
    </nav>
  );
}

/** Construit une URL de liste en conservant les filtres courants. */
export function listHref(base: string, sp: Record<string, string | string[] | undefined>, patch: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) p.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "" || (k === "page" && Number(v) <= 1)) p.delete(k);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = one(sp.ok);
  const err = one(sp.erreur);
  if (!ok && !err) return null;
  return (
    <p role="status" className={cn("mb-4 rounded-lg px-4 py-3 text-sm", ok ? "bg-accent-soft text-accent-hover" : "bg-red-50 text-danger")}>
      {ok || err}
    </p>
  );
}

export const btn = {
  primary: "inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover",
  dark: "inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-graphite",
  outline: "inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-mist",
  danger: "inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-danger hover:bg-red-50",
};
