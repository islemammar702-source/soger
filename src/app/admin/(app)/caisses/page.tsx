import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashRegisters, cashSessions, orders, users } from "@/db/schema";
import { Card, EmptyRow, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";

export default async function SessionsPage() {
  await requireStaff("pos.close_register");
  const rows = await db
    .select({ s: cashSessions, register: cashRegisters.name, user: users.name, sales: sql<string>`(select coalesce(sum(total), 0) from ${orders} o where o.cash_session_id = ${cashSessions.id} and o.status <> 'cancelled')` })
    .from(cashSessions)
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashSessions.cashRegisterId))
    .leftJoin(users, eq(users.id, cashSessions.openedBy))
    .orderBy(desc(cashSessions.openedAt))
    .limit(100);
  return (
    <>
      <PageHeader title="Sessions de caisse" description="Ouverture, ventes, clôture et écart de caisse." />
      <Card padded={false}>
        <Table>
          <thead><tr><Th>Session</Th><Th>Ouverte</Th><Th>Par</Th><Th className="text-right">Ventes</Th><Th className="text-right">Attendu</Th><Th className="text-right">Compté</Th><Th className="text-right">Écart</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>Aucune session.</EmptyRow>}
            {rows.map(({ s, register, user, sales }) => {
              const gap = s.countedAmount != null && s.expectedAmount != null ? Number(s.countedAmount) - Number(s.expectedAmount) : null;
              return (
                <tr key={s.id} className="hover:bg-mist/40">
                  <Td><Link href={`/admin/caisses/${s.id}`} className="font-semibold text-accent">#{s.id}</Link> <span className="text-xs text-steel">{register}</span> {!s.closedAt && <Badge tone="bg-accent-soft text-accent-hover">Ouverte</Badge>}</Td>
                  <Td className="text-steel">{formatDateTime(s.openedAt)}</Td>
                  <Td className="text-steel">{user}</Td>
                  <Td className="text-right tabular-nums">{formatTND(sales)}</Td>
                  <Td className="text-right tabular-nums">{s.expectedAmount ? formatTND(s.expectedAmount) : "—"}</Td>
                  <Td className="text-right tabular-nums">{s.countedAmount ? formatTND(s.countedAmount) : "—"}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${gap ? (gap < 0 ? "text-danger" : "text-amber-700") : ""}`}>{gap == null ? "—" : formatTND(gap)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
