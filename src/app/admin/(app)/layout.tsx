import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/db";
import { AdminNav } from "@/components/admin/admin-nav";
import { ADMIN_NAV } from "@/components/admin/nav-config";
import { requireStaff } from "@/server/auth/dal";
import { unreadCount } from "@/server/notify";
import type { Tx } from "@/server/audit";

export const metadata: Metadata = { title: { default: "Gestion", template: "%s · Gestion SOGER" }, robots: { index: false, follow: false } };

/** Le back-office dépend toujours de la session : la navigation peut attendre le serveur. */
export const instant = false;

async function Chrome() {
  const me = await requireStaff();
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => me.can(i.permission)) })).filter((g) => g.items.length);
  const [{ n }] = await unreadCount(db as unknown as Tx, me.id);
  return <AdminNav groups={groups} user={{ name: me.name, roles: me.roleNames }} unread={n} />;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-screen bg-mist/50">
      <Suspense fallback={<div className="fixed inset-y-0 left-0 hidden w-64 bg-ink lg:block" />}>
        <Chrome />
      </Suspense>
      <main className="px-4 py-6 lg:ml-64 lg:px-8 lg:py-8">
        <Suspense fallback={<div className="space-y-4"><div className="h-8 w-64 animate-pulse rounded bg-line" /><div className="h-64 animate-pulse rounded-xl bg-line/60" /></div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
