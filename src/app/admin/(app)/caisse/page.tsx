import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, History, Plus, ShoppingCart, Wallet } from "lucide-react";
import { Card, Flash, PageHeader, StatCard, Table, Td, Th, btn } from "@/components/admin/ui";
import { SubmitButton } from "@/components/ui/form";
import { PAYMENT_METHOD, formatDateTime } from "@/lib/labels";
import { formatNumber, formatTND } from "@/lib/utils";
import { getDayOperations, getDayStats, getOpenSession } from "@/server/admin/caisse-queries";
import { openSessionAction } from "@/server/admin/pos";
import { requireStaff } from "@/server/auth/dal";

const KIND_TONE = { sale: "text-ink", payment_in: "text-accent-hover", payment_out: "text-danger", expense: "text-danger" } as const;

export default async function CashDeskPage({ searchParams }: PageProps<"/admin/caisse">) {
  const me = await requireStaff("pos.use");
  const sp = await searchParams;
  const open = await getOpenSession();
  const [stats, ops] = await Promise.all([getDayStats(open?.s.id ?? null), getDayOperations()]);
  return (
    <>
      <PageHeader
        title="Caisse"
        description={open ? `${open.register} · ouverte le ${formatDateTime(open.s.openedAt)} par ${open.user ?? "—"} · fond de caisse ${formatTND(open.s.openingAmount)}` : "Caisse fermée"}
        actions={
          <>
            <Link href="/admin/caisse/ventes" className={btn.outline}><History className="size-4" /> Historique des ventes</Link>
            {open && me.can("pos.close_register") && <Link href={`/admin/caisses/${open.s.id}`} className={btn.outline}>Clôturer la caisse</Link>}
          </>
        }
      />
      <Flash sp={sp} />

      {open ? (
        <Link href="/admin/caisse/nouvelle-vente" className="mb-6 flex items-center justify-center gap-3 rounded-xl bg-accent px-6 py-5 text-xl font-bold text-white shadow-[0_12px_30px_-12px_rgb(22_163_74/0.7)] transition hover:bg-accent-hover">
          <Plus className="size-7" /> NOUVELLE VENTE
        </Link>
      ) : (
        <Card title="Ouvrir la caisse" className="mb-6 max-w-md">
          <form action={openSessionAction} className="space-y-4">
            <label className="block text-sm"><span className="mb-1 block font-medium">Fond de caisse (espèces au démarrage)</span><input name="openingAmount" defaultValue="0" inputMode="decimal" className="h-11 w-full rounded-lg border border-line px-3 text-right text-lg tabular-nums" /></label>
            <SubmitButton className="w-full">Ouvrir la session</SubmitButton>
          </form>
        </Card>
      )}

      <p className="mb-3 text-xs font-semibold tracking-wider text-steel uppercase">Aujourd&apos;hui</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Ventes du jour" value={formatTND(stats.salesTotal)} sub={`${stats.salesCount} vente(s)`} icon={<ShoppingCart className="size-4" />} />
        <StatCard label="Sommes encaissées" value={formatTND(stats.collected)} tone="success" sub={stats.byMethod.map((m) => `${PAYMENT_METHOD[m.method]} ${formatTND(m.total)}`).join(" · ") || "Aucun encaissement"} icon={<ArrowDownLeft className="size-4" />} />
        <StatCard label="Sorties d'argent" value={formatTND(stats.outflows)} sub={`Remboursements ${formatTND(stats.refunds)} · dépenses ${formatTND(stats.expenses)}`} icon={<ArrowUpRight className="size-4" />} />
        <StatCard label="Nombre de ventes" value={formatNumber(stats.salesCount)} />
        <StatCard label="Crédits clients" value={formatTND(stats.creditToday)} tone={stats.creditToday > 0 ? "warning" : "default"} sub={`${stats.creditSales} vente(s) du jour non soldée(s) · total dû ${formatTND(stats.creditAll)}`} href="/admin/caisse/ventes?filtre=credit" />
        <StatCard label="Solde disponible (espèces)" value={stats.drawer === null ? "—" : formatTND(stats.drawer)} sub={open ? "Fond + espèces encaissées − sorties en espèces" : "Caisse fermée"} icon={<Wallet className="size-4" />} />
      </div>

      <Card title="Historique des opérations du jour" className="mt-6" padded={false}>
        <Table minWidth={860}>
          <thead><tr><Th>Heure</Th><Th>Opération</Th><Th>Pièce</Th><Th>Client / détail</Th><Th>Mode</Th><Th>Employé</Th><Th className="text-right">Montant</Th></tr></thead>
          <tbody>
            {ops.length === 0 && <tr><Td colSpan={7} className="py-10 text-center text-steel">Aucune opération aujourd&apos;hui.</Td></tr>}
            {ops.map((o, i) => (
              <tr key={i} className="hover:bg-mist/40">
                <Td className="whitespace-nowrap text-steel">{formatDateTime(o.at).split(" ").pop()}</Td>
                <Td className={`font-medium ${KIND_TONE[o.kind]}`}>{o.label}</Td>
                <Td className="font-mono text-xs">{o.href && o.ref ? <Link href={o.href} className="text-accent hover:underline">{o.ref}</Link> : (o.ref ?? "—")}</Td>
                <Td>{o.party ?? <span className="text-steel">Client de passage</span>}</Td>
                <Td className="text-xs">{o.method ? PAYMENT_METHOD[o.method] : "—"}</Td>
                <Td className="text-xs text-steel">{o.user ?? "—"}</Td>
                <Td className={`text-right font-semibold tabular-nums ${KIND_TONE[o.kind]}`}>{o.kind === "payment_out" || o.kind === "expense" ? "−" : o.kind === "payment_in" ? "+" : ""}{formatTND(o.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-4 py-2.5 text-xs text-steel">Une vente apparaît une seule fois ; seules les sommes réellement encaissées (lignes « Encaissement ») entrent en caisse. Une vente à crédit n&apos;ajoute rien à la caisse.</p>
      </Card>
    </>
  );
}

/** Données en temps réel : la navigation attend le serveur, un écran de chargement s'affiche. */
export const instant = false;
