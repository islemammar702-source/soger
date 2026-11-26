import Link from "next/link";
import { Download } from "lucide-react";
import { ColumnChart, RankBars } from "@/components/admin/charts";
import { Card, PageHeader, StatCard, Table, Td, Th, btn, one } from "@/components/admin/ui";
import { CHANNEL, PAYMENT_METHOD } from "@/lib/labels";
import { formatNumber, formatTND } from "@/lib/utils";
import { getReport, parsePeriod } from "@/server/admin/reports";
import { requireStaff } from "@/server/auth/dal";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1).replace(".", ",")} %`);

function presets() {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
  const pm0 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pm1 = new Date(now.getFullYear(), now.getMonth(), 0);
  const q0 = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return [
    ["Ce mois", iso(m0), iso(now)],
    ["Mois dernier", iso(pm0), iso(pm1)],
    ["Ce trimestre", iso(q0), iso(now)],
    ["Cette année", `${now.getFullYear()}-01-01`, iso(now)],
    ["12 derniers mois", iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1)), iso(now)],
  ] as const;
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/rapports">) {
  const me = await requireStaff("reports.view");
  const sp = await searchParams;
  const period = parsePeriod(one(sp.du) || undefined, one(sp.au) || undefined);
  const r = await getReport(period);
  const q = `du=${period.fromStr}&au=${period.toStr}`;
  const canCost = me.can("products.view_cost");
  const exp = (type: string) => me.can("reports.export") && (
    <span className="flex gap-2">
      <a href={`/admin/export/rapport?type=${type}&${q}&format=xlsx`} className="text-xs font-medium text-accent">Excel</a>
      <a href={`/admin/export/rapport?type=${type}&${q}&format=csv`} className="text-xs font-medium text-accent">CSV</a>
    </span>
  );
  return (
    <>
      <PageHeader title="Statistiques et rapports" description={`Période du ${period.fromStr.split("-").reverse().join("/")} au ${period.toStr.split("-").reverse().join("/")} · ventes confirmées et livrées`} />
      <form action="/admin/rapports" className="mb-6 flex flex-wrap items-center gap-2">
        {presets().map(([l, a, b]) => <Link key={l} href={`/admin/rapports?du=${a}&au=${b}`} className={`h-9 rounded-lg border px-3 text-sm leading-9 ${period.fromStr === a && period.toStr === b ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-mist"}`}>{l}</Link>)}
        <input type="date" name="du" defaultValue={period.fromStr} aria-label="Du" className="h-9 rounded-lg border border-line bg-white px-3 text-sm" />
        <input type="date" name="au" defaultValue={period.toStr} aria-label="Au" className="h-9 rounded-lg border border-line bg-white px-3 text-sm" />
        <button className="h-9 rounded-lg bg-ink px-4 text-sm text-white">Appliquer</button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Chiffre d'affaires TTC" value={formatTND(r.summary.ttc)} />
        <StatCard label="Chiffre d'affaires HT" value={formatTND(r.summary.ht)} />
        <StatCard label="Ventes" value={formatNumber(r.summary.orders)} sub={`Panier moyen ${formatTND(r.summary.avg)}`} />
        {canCost && <StatCard label="Marge brute estimée" value={formatTND(r.summary.margin)} sub={`Taux ${pct(r.summary.marginRate)}`} />}
        <StatCard label="TVA collectée (factures)" value={formatTND(r.vat.collected)} sub={`${r.vat.invoices} facture(s), ${r.vat.credits} avoir(s)`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card title={`Évolution des ventes TTC (par ${r.granularity})`} actions={exp("ventes")}><ColumnChart data={r.timeline} axisLabel={r.granularity === "mois" ? "Mois" : "Jour"} /></Card>
        <Card title="Ventes par canal">
          <ul className="space-y-3">
            {r.byChannel.length === 0 && <li className="text-sm text-steel">Aucune vente.</li>}
            {r.byChannel.map((c) => <li key={c.key} className="flex justify-between text-sm"><span>{CHANNEL[c.key]} <span className="text-steel">({c.n})</span></span><strong className="tabular-nums">{formatTND(c.ttc)}</strong></li>)}
          </ul>
          <p className="mt-6 mb-2 text-xs font-semibold tracking-wide text-steel uppercase">Encaissements par mode</p>
          <ul className="space-y-1.5">
            {r.payments.map((p) => <li key={p.method + p.direction} className="flex justify-between text-sm"><span>{PAYMENT_METHOD[p.method]}{p.direction === "out" ? " (sorties)" : ""}</span><span className="tabular-nums">{p.direction === "out" ? "−" : ""}{formatTND(p.total)}</span></li>)}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Ventes HT par catégorie" actions={exp("categories")}><RankBars data={r.byCategory.map((c) => ({ label: c.label, value: c.ht, hint: canCost ? `Marge ${formatTND(c.margin)}` : undefined }))} /></Card>
        <Card title="Meilleurs clients (TTC)" actions={exp("clients")} padded={false}>
          <Table minWidth={360}><tbody>
            {r.byCustomer.length === 0 && <tr><Td className="text-steel">Aucune vente nominative.</Td></tr>}
            {r.byCustomer.map((c) => <tr key={c.id}><Td><Link href={`/admin/clients/${c.id}`} className="hover:text-accent">{c.name}</Link> <span className="font-mono text-xs text-steel">{c.code}</span></Td><Td className="text-right text-steel">{c.n}</Td><Td className="text-right font-semibold tabular-nums">{formatTND(c.ttc)}</Td></tr>)}
          </tbody></Table>
        </Card>
      </div>

      <Card title="Produits les plus vendus" className="mt-6" actions={exp("produits")} padded={false}>
        <Table minWidth={720}>
          <thead><tr><Th>Référence</Th><Th>Désignation</Th><Th className="text-right">Quantité</Th><Th className="text-right">CA HT</Th>{canCost && <Th className="text-right">Marge</Th>}</tr></thead>
          <tbody>
            {r.byProduct.map((p) => <tr key={`${p.sku}-${p.name}`}><Td className="font-mono text-xs">{p.sku}</Td><Td>{p.name}</Td><Td className="text-right tabular-nums">{formatNumber(p.qty, p.qty % 1 ? 3 : 0)}</Td><Td className="text-right tabular-nums">{formatTND(p.ht)}</Td>{canCost && <Td className="text-right tabular-nums">{formatTND(p.margin)}{p.uncosted && <span className="block text-xs text-amber-700">coût manquant</span>}</Td>}</tr>)}
          </tbody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="TVA (aide à la déclaration)">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-steel">Base HT facturée</dt><dd className="tabular-nums">{formatTND(r.vat.base)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">TVA collectée</dt><dd className="tabular-nums">{formatTND(r.vat.collected)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">TVA déductible (achats + dépenses)</dt><dd className="tabular-nums">{formatTND(r.vat.deductible)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Solde estimé</dt><dd className="tabular-nums">{formatTND(r.vat.collected - r.vat.deductible)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">Droits de timbre facturés</dt><dd className="tabular-nums">{formatTND(r.vat.stamp)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-amber-700">Indicatif : à valider par votre comptable avant toute déclaration.</p>
        </Card>
        <Card title="Achats et dépenses" actions={exp("depenses")}>
          <p className="text-sm">Commandes fournisseurs : <strong>{formatTND(r.purchases.ttc)}</strong> <span className="text-steel">({r.purchases.n})</span></p>
          <p className="text-sm">Factures fournisseurs : <strong>{formatTND(r.purchases.supplierInvoicesTtc)}</strong> <span className="text-steel">({r.purchases.supplierInvoices})</span></p>
          <div className="mt-4"><RankBars data={r.expenses} /></div>
        </Card>
        <Card title="Créances clients par ancienneté">
          <dl className="space-y-1.5 text-sm">
            {[["Non échues", r.aging.current], ["1 – 30 jours", r.aging.d30], ["31 – 60 jours", r.aging.d60], ["61 – 90 jours", r.aging.d90], ["Plus de 90 jours", r.aging.older]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between"><dt className="text-steel">{l}</dt><dd className={`tabular-nums ${(v as number) > 0 && l !== "Non échues" ? "font-semibold text-amber-700" : ""}`}>{formatTND(v as number)}</dd></div>
            ))}
          </dl>
          {canCost && (
            <>
              <p className="mt-6 mb-2 text-xs font-semibold tracking-wide text-steel uppercase">Stock (aujourd&apos;hui)</p>
              <p className="text-sm">Valeur au prix d&apos;achat : <strong>{formatTND(r.valuation.cost)}</strong></p>
              <p className="text-sm">Valeur au prix de vente HT : <strong>{formatTND(r.valuation.retail)}</strong></p>
            </>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs text-steel">{me.can("reports.export") && <a href={`/admin/export/rapport?type=produits&${q}&format=xlsx`} className={btn.outline}><Download className="size-4" /> Exporter les ventes par produit</a>}</p>
    </>
  );
}
