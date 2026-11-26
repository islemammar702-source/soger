import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cashRegisters, cashSessions, customers, users } from "@/db/schema";
import { PosTerminal } from "@/components/admin/pos-terminal";
import { Card, Flash, PageHeader, btn, one } from "@/components/admin/ui";
import { SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { openSessionAction } from "@/server/admin/pos";
import { requireStaff } from "@/server/auth/dal";

export default async function PosPage({ searchParams }: PageProps<"/admin/caisse">) {
  const me = await requireStaff("pos.use");
  const sp = await searchParams;
  const [open] = await db
    .select({ s: cashSessions, user: users.name, register: cashRegisters.name })
    .from(cashSessions)
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashSessions.cashRegisterId))
    .leftJoin(users, eq(users.id, cashSessions.openedBy))
    .where(and(isNull(cashSessions.closedAt), eq(cashRegisters.code, "CAISSE1")));
  if (!open) {
    return (
      <>
        <PageHeader title="Caisse" />
        <Flash sp={sp} />
        <Card title="Ouvrir la caisse" className="max-w-md">
          <form action={openSessionAction} className="space-y-4">
            <label className="block text-sm"><span className="mb-1 block font-medium">Fond de caisse (espèces au démarrage)</span><input name="openingAmount" defaultValue="0" inputMode="decimal" className="h-11 w-full rounded-lg border border-line px-3 text-right text-lg tabular-nums" /></label>
            <SubmitButton className="w-full">Ouvrir la session</SubmitButton>
          </form>
        </Card>
      </>
    );
  }
  const cid = Number(one(sp.client)) || null;
  const [c] = cid ? await db.select().from(customers).where(eq(customers.id, cid)) : [];
  return (
    <>
      <PageHeader
        title="Caisse"
        description={`${open.register} · ouverte le ${formatDateTime(open.s.openedAt)} par ${open.user ?? "—"} · fond ${formatTND(open.s.openingAmount)}`}
        actions={me.can("pos.close_register") && <Link href={`/admin/caisses/${open.s.id}`} className={btn.outline}>Clôturer la caisse</Link>}
      />
      <PosTerminal sessionId={open.s.id} canDiscount={me.can("pos.discount")} initialCustomer={c ? { id: c.id, code: c.code, name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" "), pro: c.type === "professional" && c.priceTier === "professional" } : null} />
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
