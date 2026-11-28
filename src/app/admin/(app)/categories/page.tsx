import Link from "next/link";
import { qcol } from "@/db/qcol";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { btn, Card, Flash, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { deleteCategoryAction, saveCategoryAction } from "@/server/admin/products";
import { requireStaff } from "@/server/auth/dal";

const input = "h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm outline-none focus:border-accent";

export default async function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  const me = await requireStaff("categories.view");
  const sp = await searchParams;
  const rows = await db
    .select({ c: categories, count: sql<number>`(select count(*)::int from ${products} p where p.category_id = ${qcol(categories.id)})` })
    .from(categories)
    .orderBy(asc(categories.sector), asc(categories.sortOrder));
  const canEdit = me.can("categories.update");
  const delId = Number(sp.supprimer) || 0;
  const pending = me.can("categories.delete") ? rows.find(({ c, count }) => c.id === delId && count > 0) : undefined;
  const row = (c?: typeof categories.$inferSelect, count?: number) => (
    <tr key={c?.id ?? "new"} className="align-top">
      <Td colSpan={7} className="p-0">
        <form action={saveCategoryAction} className="grid grid-cols-[1.4fr_1fr_120px_1.6fr_110px_70px_auto] items-center gap-2 px-4 py-2">
          {c && <input type="hidden" name="id" value={c.id} />}
          <input name="name" defaultValue={c?.name} placeholder="Nom" required className={input} disabled={!canEdit && !!c} />
          <input name="slug" defaultValue={c?.slug} placeholder="slug-auto" className={input + " font-mono text-xs"} disabled={!canEdit && !!c} />
          <select name="sector" defaultValue={c?.sector ?? "industrial"} className={input} disabled={!canEdit && !!c}><option value="industrial">Industrie</option><option value="agricultural">Agriculture</option></select>
          <input name="description" defaultValue={c?.description ?? ""} placeholder="Description" className={input} disabled={!canEdit && !!c} />
          <input name="icon" defaultValue={c?.icon ?? ""} placeholder="Icône" className={input + " text-xs"} disabled={!canEdit && !!c} />
          <input name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 0} className={input} disabled={!canEdit && !!c} />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} disabled={!canEdit && !!c} /> Active</label>
            {(c ? canEdit : me.can("categories.create")) && <button className="h-9 rounded-md bg-ink px-3 text-xs font-medium text-white">{c ? "Enregistrer" : "Ajouter"}</button>}
            {c && me.can("categories.delete") && (
              <button formAction={deleteCategoryAction} className="h-9 rounded-md px-2 text-xs text-danger hover:bg-red-50" title={count ? `${count} produit(s)` : "Supprimer"}>Suppr.</button>
            )}
            {c && <span className="text-xs text-steel">{count} prod.</span>}
          </div>
        </form>
      </Td>
    </tr>
  );
  return (
    <>
      <PageHeader title="Catégories" description="Ordre d'affichage, secteur (industrie / agriculture) et icône (nom Lucide, ex. CircleDot, Cog, Waves)." />
      <Flash sp={sp} />
      {pending && (
        <Card className="mb-4 border-red-200">
          <form action={deleteCategoryAction} className="space-y-3">
            <input type="hidden" name="id" value={pending.c.id} />
            <p className="text-sm text-ink">
              <strong>{pending.count} produit(s)</strong> sont rattachés à la catégorie « <strong>{pending.c.name}</strong> ». Pour la
              supprimer, choisissez ce que deviennent ces produits :
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select name="transferTo" required defaultValue="" className={input + " max-w-xs"} data-testid="transfer-to">
                <option value="" disabled>Choisir…</option>
                <option value="archive">Archiver les produits (famille plus vendue — retirés du site)</option>
                <optgroup label="Ou transférer vers la catégorie :">
                {rows.filter(({ c }) => c.id !== pending.c.id).map(({ c }) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.sector === "industrial" ? "Industrie" : "Agriculture"})</option>
                ))}
                </optgroup>
              </select>
              <button className={btn.danger}>Confirmer la suppression</button>
              <Link href="/admin/categories" className={btn.outline}>Annuler</Link>
            </div>
            <p className="text-xs text-steel">Sinon, décochez « Active » pour simplement masquer la catégorie sur le site.</p>
          </form>
        </Card>
      )}
      <Card padded={false}>
        <Table minWidth={1100}>
          <thead><tr><Th>Nom</Th><Th>Slug</Th><Th>Secteur</Th><Th>Description</Th><Th>Icône</Th><Th>Ordre</Th><Th /></tr></thead>
          <tbody>
            {me.can("categories.create") && row()}
            {rows.map(({ c, count }) => row(c, count))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
