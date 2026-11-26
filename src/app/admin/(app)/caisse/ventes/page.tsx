import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, EmptyRow, FilterSelect, PageHeader, Pagination, StatCard, Table, Td, Th, btn, listHref, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { listStoreSales } from "@/server/admin/caisse-queries";
import { requireStaff } from "@/server/auth/dal";

export default async function StoreSalesPage({ searchParams }: PageProps<"/admin/caisse/ventes">) {
  await requireStaff("pos.use");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const r = await listStoreSales({ q: one(sp.q).trim() || undefined, from: one(sp.du) || undefined, to: one(sp.au) || undefined, filter: one(sp.filtre) || undefined, page });
  return (
    <>
      <PageHeader title="Historique des ventes" description="Ventes en boutique (caisse)." back={{ href: "/admin/caisse", label: "Caisse" }} actions={<Link href="/admin/caisse/nouvelle-vente" className={btn.primary}><Plus className="size-4" /> Nouvelle vente</Link>} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total des ventes" value={formatTND(r.sum)} sub={`${r.total} vente(s)`} />
        <StatCard label="Montant payé" value={formatTND(r.paid)} tone="success" />
        <StatCard label="Reste à payer" value={formatTND(r.sum - r.paid)} tone={r.sum - r.paid > 0.0005 ? "warning" : "default"} />
      </div>
      <form action="/admin/caisse/ventes" className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={one(sp.q)} placeholder="N° de vente, client, téléphone…" className="h-10 min-w-56 flex-1 rounded-lg border border-line bg-white px-3 text-sm" />
        <input type="date" name="du" defaultValue={one(sp.du)} aria-label="Du" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <input type="date" name="au" defaultValue={one(sp.au)} aria-label="Au" className="h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <FilterSelect name="filtre" label="Toutes les ventes" value={one(sp.filtre)} options={[["credit", "Avec reste à payer"], ["soldees", "Soldées"]]} />
        <button className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-white">Filtrer</button>
      </form>
      <Card padded={false}>
        <Table minWidth={1080}>
          <thead><tr><Th>N° de vente</Th><Th>Date et heure</Th><Th>Client</Th><Th className="text-right">Produits</Th><Th className="text-right">Total</Th><Th className="text-right">Payé</Th><Th className="text-right">Reste à payer</Th><Th>Employé</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {r.rows.length === 0 && <EmptyRow colSpan={9}>Aucune vente.</EmptyRow>}
            {r.rows.map((s) => {
              const rest = Number(s.total) - Number(s.paid);
              return (
                <tr key={s.id} className="hover:bg-mist/40">
                  <Td><Link href={`/admin/caisse/ventes/${s.id}`} className="font-mono text-xs font-semibold text-accent">{s.number}</Link>{s.status === "returned" && <Badge className="ml-1" tone="bg-violet-50 text-violet-700">Retour</Badge>}</Td>
                  <Td className="whitespace-nowrap text-steel">{formatDateTime(s.at)}</Td>
                  <Td>{s.party ?? <span className="text-steel">Client de passage</span>}{s.phone && <p className="text-xs text-steel">{s.phone}</p>}</Td>
                  <Td className="text-right tabular-nums">{s.items}</Td>
                  <Td className="text-right font-semibold tabular-nums">{formatTND(s.total)}</Td>
                  <Td className="text-right tabular-nums">{formatTND(s.paid)}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${rest > 0.0005 ? "text-amber-700" : "text-steel"}`}>{formatTND(Math.max(0, rest))}</Td>
                  <Td className="text-xs text-steel">{s.user ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    <Link href={`/admin/caisse/ventes/${s.id}`} className="font-medium text-accent">Détails</Link>
                    <span className="mx-1.5 text-line">|</span>
                    <a href={`/documents/ticket/${s.id}`} target="_blank" className="font-medium text-accent">Ticket</a>
                    {rest > 0.0005 && <><span className="mx-1.5 text-line">|</span><Link href={`/admin/caisse/ventes/${s.id}#paiement`} className="font-medium text-amber-700">Encaisser</Link></>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={r.pageCount} href={(n) => listHref("/admin/caisse/ventes", sp, { page: n })} />
      </Card>
    </>
  );
}

/** Données en temps réel : la navigation attend le serveur, un écran de chargement s'affiche. */
export const instant = false;
