import type { Metadata } from "next";
import { AccountShell, EmptyState } from "@/components/site/account-shell";
import { SubmitButton } from "@/components/ui/form";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/server/account-actions";
import { getMyNotifications } from "@/server/account-data";
import { requireCustomer } from "@/server/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.notificationsTitle, robots: { index: false } };
}

async function Notifications() {
  const { t, dateTime, href } = await getI18n();
  const a = t.account;
  const { user } = await requireCustomer(href("/compte/notifications"));
  const list = await getMyNotifications(user.id);
  if (!list.length) return <EmptyState title={a.noNotifications} text={a.noNotificationsText} />;
  return (
    <div className="space-y-4">
      {list.some((n) => !n.readAt) && (
        <form action={markNotificationsReadAction}><SubmitButton variant="outline">{a.markRead}</SubmitButton></form>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
        {list.map((n) => (
          <li key={n.id} className={cn("px-4 py-3", !n.readAt && "bg-accent-soft/30")}>
            <p className="text-sm font-semibold">{n.link ? <Link href={n.link} className="hover:text-accent">{n.title}</Link> : n.title}</p>
            {n.body && <p className="text-sm text-steel">{n.body}</p>}
            <p className="mt-1 text-xs text-steel">{dateTime(n.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function NotificationsPage() {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.notificationsTitle} current="/compte/notifications">
      <Notifications />
    </AccountShell>
  );
}
