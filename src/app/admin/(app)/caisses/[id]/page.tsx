import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashRegisters, cashSessions, expenses, orders, payments } from "@/db/schema";
import { Card, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/admin/ui";
import { SubmitButton } from "@/components/ui/form";
import { PAYMENT_METHOD, formatDateTime } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { closeSessionAction, expectedCash } from "@/server/admin/pos";
import { requireStaff } from "@/server/auth/dal";
import type { Tx } from "@/server/audit";

export default async function SessionPage({ params, searchParams }: PageProps<"/admin/caisses/[id]">) {
  await requireStaff("pos.close_register");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [row] = await db.select({ s: cashSessions, register: cashRegisters.name }).from(cashSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashSessions.cashRegisterId)).where(eq(cashSessions.id, id));
  if (!row) notFound();
  const { s } = row;
  const [byMethod, sales, exps, expected] = await Promise.all([
    db.select({ method: payments.method, direction: payments.direction, total: sql<string>`sum(${payments.amount})`, n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.cashSessionId, id)).groupBy(payments.method, payments.direction),
    db.select().from(orders).where(eq(orders.cashSessionId, id)).orderBy(desc(orders.createdAt)),
    db.select().from(expenses).where(eq(expenses.cashSessionId, id)),
    s.closedAt ? Promise.resolve(Number(s.expectedAmount)) : expectedCash(db as unknown as Tx, id),
  ]);
  const salesTotal = sales.filter((o) => o.status !== "cancelled").reduce((t, o) => t + Number(o.total), 0);
  return (
    <>
      <PageHeader title={`Session de caisse #${id}`} description={`${row.register} · ouverte le ${formatDateTime(s.openedAt)}${s.closedAt ? ` · clôturée le ${formatDateTime(s.closedAt)}` : ""}`} back={{ href: "/admin/caisses", label: "Sessions" }} />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Fond de caisse" value={formatTND(s.openingAmount)} />
        <StatCard label="Ventes de la session" value={formatTND(salesTotal)} sub={`${sales.length} vente(s)`} />
        <StatCard label="Espèces attendues" value={formatTND(expected)} />
        {s.closedAt && <StatCard label="Écart" value={formatTND(Number(s.countedAmount) - Number(s.expectedAmount))} tone={Number(s.countedAmount) - Number(s.expectedAmount) < 0 ? "danger" : "default"} sub={`Compté : ${formatTND(s.countedAmount)}`} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Encaissements par mode" padded={false}>
          <Table minWidth={360}>
            <tbody>
              {byMethod.length === 0 && <tr><Td className="text-steel">Aucun mouvement.</Td></tr>}
              {byMethod.map((m) => <tr key={m.method + m.direction}><Td>{PAYMENT_METHOD[m.method]}{m.direction === "out" && " (sorties)"}</Td><Td className="text-right text-steel">{m.n}</Td><Td className="text-right font-semibold tabular-nums">{m.direction === "out" ? "−" : ""}{formatTND(m.total)}</Td></tr>)}
              {exps.length > 0 && <tr><Td>Dépenses payées en caisse</Td><Td className="text-right text-steel">{exps.length}</Td><Td className="text-right font-semibold tabular-nums">−{formatTND(exps.reduce((t, e) => t + Number(e.amount), 0))}</Td></tr>}
            </tbody>
          </Table>
        </Card>
        {!s.closedAt ? (
          <Card title="Clôturer la caisse">
            <form action={closeSessionAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <label className="block text-sm"><span className="mb-1 block font-medium">Espèces comptées dans le tiroir</span><input name="countedAmount" inputMode="decimal" required className="h-11 w-full rounded-lg border border-line px-3 text-right text-lg tabular-nums" /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium">Commentaire</span><input name="notes" className="h-10 w-full rounded-lg border border-line px-3" /></label>
              <SubmitButton variant="dark">Clôturer</SubmitButton>
            </form>
          </Card>
        ) : (
          <Card title="Commentaire"><p className="text-sm text-steel">{s.notes ?? "—"}</p></Card>
        )}
      </div>
      <Card title="Ventes" className="mt-6" padded={false}>
        <Table minWidth={480}>
          <thead><tr><Th>N°</Th><Th>Heure</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>{sales.map((o) => <tr key={o.id}><Td><Link href={`/admin/commandes/${o.id}`} className="font-mono text-xs text-accent">{o.number}</Link></Td><Td className="text-steel">{formatDateTime(o.createdAt)}</Td><Td className="text-right tabular-nums">{formatTND(o.total)}</Td></tr>)}</tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
