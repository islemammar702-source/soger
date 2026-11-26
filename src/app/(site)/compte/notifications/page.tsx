import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/server/account-actions";
import { getMyNotifications } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

async function Notifications() {
  const { user } = await requireCustomer("/compte/notifications");
  const list = await getMyNotifications(user.id);
  if (!list.length) return <EmptyState title="Aucune notification" text="Vous serez prévenu ici de l'avancement de vos commandes et devis." />;
  return (
    <div className="space-y-4">
      {list.some((n) => !n.readAt) && (
        <form action={markNotificationsReadAction}><SubmitButton variant="outline">Tout marquer comme lu</SubmitButton></form>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
        {list.map((n) => (
          <li key={n.id} className={cn("px-4 py-3", !n.readAt && "bg-accent-soft/30")}>
            <p className="text-sm font-semibold">{n.link ? <Link href={n.link} className="hover:text-accent">{n.title}</Link> : n.title}</p>
            {n.body && <p className="text-sm text-steel">{n.body}</p>}
            <p className="mt-1 text-xs text-steel">{formatDateTime(n.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AccountShell title="Notifications" current="/compte/notifications">
      <Notifications />
    </AccountShell>
  );
}
