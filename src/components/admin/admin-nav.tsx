"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight, Bell, Boxes, ChartColumn, ClipboardCheck, ExternalLink, FileSpreadsheet, FileText, FolderTree, History, Landmark,
  LayoutDashboard, LogOut, Menu, Package, PackagePlus, Receipt, ScanBarcode, Search, Settings, ShoppingBag, Tag, TrendingDown, Truck,
  UserCog, Users, Wallet, Warehouse, X, type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/site/logo";
import { logoutAction } from "@/server/account-actions";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav-config";

const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight, Boxes, ChartColumn, ClipboardCheck, FileSpreadsheet, FileText, FolderTree, History, Landmark, LayoutDashboard, Package,
  PackagePlus, Receipt, ScanBarcode, Settings, ShoppingBag, Tag, TrendingDown, Truck, UserCog, Users, Wallet, Warehouse,
};
const noop = () => () => {};

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  // L'entrée active est la plus longue qui correspond au chemin courant.
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  const active = all.filter((h) => pathname === h || (h !== "/admin" && pathname.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="space-y-5">
      {groups.map((g) => (
        <div key={g.title || "root"}>
          {g.title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-white/35 uppercase">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Boxes;
              const on = item.href === active;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", on ? "bg-white/10 font-medium text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}
                  >
                    <Icon className={cn("size-4", on && "text-accent")} /> {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-3 text-white">
      <LogoMark className="size-8" />
      <span className="leading-tight">
        <span className="block font-display text-lg font-bold">SOGER</span>
        <span className="block text-[10px] tracking-[0.14em] text-white/45 uppercase">Gestion</span>
      </span>
    </Link>
  );
}

export function AdminNav({ groups, user, unread }: { groups: NavGroup[]; user: { name: string; roles: string[] }; unread: number }) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto bg-ink px-3 py-5 lg:flex">
        <Brand />
        <div className="mt-6 flex-1"><NavLinks groups={groups} /></div>
        <Link href="/" target="_blank" className="mt-6 flex items-center gap-2 px-3 text-xs text-white/45 hover:text-white">
          <ExternalLink className="size-3.5" /> Voir le site public
        </Link>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:pl-72">
        <button type="button" onClick={() => setOpen(true)} aria-label="Menu" className="grid size-10 place-items-center rounded-lg hover:bg-mist lg:hidden">
          <Menu className="size-5" />
        </button>
        <form action="/admin/recherche" className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" />
          <input name="q" placeholder="Produit, client, commande, facture…" aria-label="Recherche globale" className="h-10 w-full rounded-lg border border-line bg-mist/60 pr-3 pl-9 text-sm outline-none focus:border-accent focus:bg-white" />
        </form>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/notifications" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`} className="relative grid size-10 place-items-center rounded-lg hover:bg-mist">
            <Bell className="size-5" />
            {unread > 0 && <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold leading-tight">{user.name}</p>
            <p className="text-xs text-steel">{user.roles.join(", ")}</p>
          </div>
          <form action={logoutAction}>
            <input type="hidden" name="area" value="staff" />
            <button type="submit" aria-label="Se déconnecter" className="grid size-10 place-items-center rounded-lg text-steel hover:bg-mist hover:text-danger">
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </header>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-ink px-3 py-5">
              <div className="flex items-center justify-between">
                <Brand />
                <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="grid size-10 place-items-center rounded-lg text-white hover:bg-white/10"><X className="size-5" /></button>
              </div>
              <div className="mt-6"><NavLinks groups={groups} onNavigate={() => setOpen(false)} /></div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
