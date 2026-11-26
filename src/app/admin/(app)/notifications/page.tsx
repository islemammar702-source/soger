import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { Card, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/server/account-actions";
import { requireStaff } from "@/server/auth/dal";

export default async function NotificationsPage() {
  const me = await requireStaff();
  const list = await db.select().from(notifications).where(eq(notifications.userId, me.id)).orderBy(desc(notifications.createdAt)).limit(100);
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={list.some((n) => !n.readAt) ? <form action={markNotificationsReadAction}><SubmitButton variant="outline">Tout marquer comme lu</SubmitButton></form> : null}
      />
      <Card padded={false}>
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <li key={n.id} className={cn("px-5 py-3", !n.readAt && "bg-accent-soft/30")}>
                <p className="text-sm font-semibold">{n.link ? <Link href={n.link} className="hover:text-accent">{n.title}</Link> : n.title}</p>
                {n.body && <p className="text-sm text-steel">{n.body}</p>}
                <p className="mt-1 text-xs text-steel">{formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-10 text-center text-sm text-steel">Aucune notification.</p>
        )}
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
