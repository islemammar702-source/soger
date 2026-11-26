import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, FileText, Package } from "lucide-react";
import { AreaChart, ColumnChart, RankBars } from "@/components/admin/charts";
import { Card, PageHeader, StatCard } from "@/components/admin/ui";
import { formatTND } from "@/lib/utils";
import { getDashboard } from "@/server/admin/dashboard";
import { redirect } from "next/navigation";
import { ADMIN_NAV } from "@/components/admin/nav-config";
import { requireStaff } from "@/server/auth/dal";

const pct = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(1).replace(".", ",")} %`;

export default async function DashboardPage() {
  const me = await requireStaff();
  // Rôle sans tableau de bord (ex. magasinier) : on ouvre son premier module autorisé.
  if (!me.can("dashboard.view")) {
    const first = ADMIN_NAV.flatMap((g) => g.items).find((i) => me.can(i.permission));
    redirect(first?.href ?? "/admin/acces-refuse");
  }
  const d = await getDashboard();
  const canCost = me.can("products.view_cost");
  return (
    <>
      <PageHeader title="Tableau de bord" description="Chiffres calculés en temps réel sur les commandes confirmées et livrées." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventes du jour" value={formatTND(d.day.total)} sub={`${d.day.count} vente(s)`} />
        <StatCard
          label="Chiffre d'affaires du mois"
          value={formatTND(d.month.total)}
          sub={
            d.growth === null ? "Pas de comparaison (mois précédent vide)" : (
              <span className={d.growth >= 0 ? "text-accent-hover" : "text-danger"}>
                {d.growth >= 0 ? <ArrowUpRight className="inline size-3.5" /> : <ArrowDownRight className="inline size-3.5" />} {pct(d.growth)} vs mois précédent ({formatTND(d.prevMonth.total)})
              </span>
            )
          }
        />
        <StatCard label="Commandes du mois" value={String(d.month.count)} sub={d.pendingOrders ? <Link href="/admin/commandes?statut=pending" className="text-amber-700 hover:underline">{d.pendingOrders} en attente de confirmation</Link> : "Aucune en attente"} href="/admin/commandes" />
        {canCost ? (
          <StatCard label="Marge estimée (mois)" value={formatTND(d.margin.margin)} sub={d.margin.rate === null ? "—" : `Taux ${pct(d.margin.rate).replace("+", "")} sur ${formatTND(d.margin.revenue)} HT${d.margin.uncosted ? ` · ${d.margin.uncosted} ligne(s) sans coût` : ""}`} />
        ) : (
          <StatCard label="Commandes en attente" value={String(d.pendingOrders)} sub="À confirmer" href="/admin/commandes?statut=pending" />
        )}
        <StatCard label="Devis en attente" value={String(d.pendingQuotes.count)} sub={`Montant ${formatTND(d.pendingQuotes.total)}`} href="/admin/devis" icon={<FileText className="size-4" />} />
        <StatCard label="Créances clients" value={formatTND(d.receivables.due)} sub={`${d.receivables.count} facture(s) à encaisser`} tone={d.receivables.due > 0 ? "warning" : "default"} href="/admin/factures?statut=impayees" />
        <StatCard label="Dettes fournisseurs" value={formatTND(d.debts.due)} sub={`${d.debts.count} facture(s) à régler`} href="/admin/factures?type=supplier&statut=impayees" />
        <StatCard label="Alertes stock" value={`${d.outOfStock.length} rupture(s)`} sub={`${d.lowStock.length} sous le minimum`} tone={d.outOfStock.length ? "danger" : d.lowStock.length ? "warning" : "success"} href="/admin/stock?alerte=1" icon={<AlertTriangle className="size-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Ventes des 30 derniers jours (TTC)"><AreaChart data={d.dailySeries} /></Card>
        <Card title="Chiffre d'affaires mensuel (TTC, 12 mois)"><ColumnChart data={d.monthlySeries} axisLabel="Mois" /></Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Produits les plus vendus (mois, HT)"><RankBars data={d.topProducts} /></Card>
        <Card title="Ventes par catégorie (mois, HT)"><RankBars data={d.byCategory} /></Card>
        <Card title="Ruptures et stock faible" actions={<Link href="/admin/stock?alerte=1" className="text-xs font-medium text-accent">Tout voir</Link>} padded={false}>
          {d.outOfStock.length + d.lowStock.length === 0 ? (
            <p className="p-6 text-center text-sm text-steel">Aucune alerte de stock.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {[...d.outOfStock, ...d.lowStock].slice(0, 12).map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/produits/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-mist/60">
                    <span className="min-w-0"><span className="block truncate text-sm">{p.name}</span><span className="font-mono text-xs text-steel">{p.sku}</span></span>
                    <span className={`shrink-0 text-sm font-semibold ${Number(p.available) <= 0 ? "text-danger" : "text-amber-700"}`}>
                      <Package className="mr-1 inline size-3.5" />{Number(p.available)} / min {Number(p.minStock)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
