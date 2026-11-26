import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, EmptyRow, FilterBar, FilterSelect, PageHeader, Pagination, Table, Td, Th, btn, listHref, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { formatTND } from "@/lib/utils";
import { getBrandOptions, getCategoryOptions, listAdminProducts } from "@/server/admin/catalog-queries";
import { requireStaff } from "@/server/auth/dal";

const STATUS: Record<string, [string, string]> = {
  draft: ["Brouillon", "bg-steel/10 text-graphite"],
  published: ["Publié", "bg-accent-soft text-accent-hover"],
  archived: ["Archivé", "bg-red-50 text-red-700"],
};

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/produits">) {
  const me = await requireStaff("products.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ rows, total, pageCount }, cats, brands] = await Promise.all([
    listAdminProducts({ q: one(sp.q) || undefined, category: Number(one(sp.categorie)) || undefined, brand: Number(one(sp.marque)) || undefined, status: one(sp.statut) || undefined, alert: one(sp.alerte) === "1", page }),
    getCategoryOptions(),
    getBrandOptions(),
  ]);
  return (
    <>
      <PageHeader
        title="Produits"
        description={`${total} produit(s)`}
        actions={me.can("products.create") && <Link href="/admin/produits/nouveau" className={btn.primary}><Plus className="size-4" /> Nouveau produit</Link>}
      />
      <FilterBar action="/admin/produits" q={one(sp.q)} placeholder="Référence, désignation, réf. fabricant, code-barres…">
        <FilterSelect name="categorie" label="Toutes catégories" value={one(sp.categorie)} options={cats.map((c) => [String(c.id), c.name])} />
        <FilterSelect name="marque" label="Toutes marques" value={one(sp.marque)} options={brands.map((b) => [String(b.id), b.name])} />
        <FilterSelect name="statut" label="Actifs (hors archives)" value={one(sp.statut)} options={[["published", "Publiés"], ["draft", "Brouillons"], ["archived", "Archivés"], ["inactive", "Désactivés"]]} />
        <FilterSelect name="alerte" label="Tout le stock" value={one(sp.alerte)} options={[["1", "Stock faible / rupture"]]} />
      </FilterBar>
      <Card padded={false}>
        <Table minWidth={900}>
          <thead><tr><Th>Référence</Th><Th>Désignation</Th><Th>Marque</Th><Th>Catégorie</Th><Th className="text-right">Prix HT</Th><Th className="text-right">Stock dispo.</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7} />}
            {rows.map((p) => {
              const avail = Number(p.available);
              return (
                <tr key={p.id} className="hover:bg-mist/40">
                  <Td><Link href={`/admin/produits/${p.id}`} className="font-mono text-xs font-semibold text-accent hover:underline">{p.sku}</Link></Td>
                  <Td className="max-w-xs"><Link href={`/admin/produits/${p.id}`} className="line-clamp-2 hover:text-accent">{p.name}</Link></Td>
                  <Td className="text-steel">{p.brand ?? "—"}</Td>
                  <Td className="text-steel">{p.category ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatTND(p.salePrice)}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${avail <= 0 ? "text-danger" : avail <= Number(p.minStock) ? "text-amber-700" : ""}`}>{avail} <span className="text-xs font-normal text-steel">{p.unit}</span></Td>
                  <Td>
                    <Badge tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Badge>
                    {!p.isActive && <Badge tone="bg-red-50 text-red-700" className="ml-1">Désactivé</Badge>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={pageCount} href={(n) => listHref("/admin/produits", sp, { page: n })} />
      </Card>
    </>
  );
}
