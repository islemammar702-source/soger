import Link from "next/link";
import { qcol } from "@/db/qcol";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, products } from "@/db/schema";
import { btn, Card, Flash, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { deleteBrandAction, saveBrandAction } from "@/server/admin/products";
import { requireStaff } from "@/server/auth/dal";

const input = "h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm outline-none focus:border-accent";

export default async function BrandsAdminPage({ searchParams }: PageProps<"/admin/marques">) {
  const me = await requireStaff("brands.view");
  const sp = await searchParams;
  const rows = await db
    .select({ b: brands, count: sql<number>`(select count(*)::int from ${products} p where p.brand_id = ${qcol(brands.id)})` })
    .from(brands)
    .orderBy(asc(brands.sortOrder), asc(brands.name));
  const canEdit = me.can("brands.update");
  const delId = Number(sp.supprimer) || 0;
  const pending = me.can("brands.delete") ? rows.find(({ b, count }) => b.id === delId && count > 0) : undefined;
  const row = (b?: typeof brands.$inferSelect, count?: number) => (
    <tr key={b?.id ?? "new"}>
      <Td colSpan={5} className="p-0">
        <form action={saveBrandAction} className="grid grid-cols-[1.2fr_1fr_1.6fr_90px_auto] items-center gap-2 px-4 py-2">
          {b && <input type="hidden" name="id" value={b.id} />}
          <input name="name" defaultValue={b?.name} placeholder="Nom de la marque" required className={input} disabled={!canEdit && !!b} />
          <input name="country" defaultValue={b?.country ?? ""} placeholder="Pays" className={input} disabled={!canEdit && !!b} />
          <input name="logoUrl" defaultValue={b?.logoUrl ?? ""} placeholder="https://… (logo)" className={input} disabled={!canEdit && !!b} />
          <input name="sortOrder" type="number" defaultValue={b?.sortOrder ?? 0} className={input} disabled={!canEdit && !!b} />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={b?.isActive ?? true} disabled={!canEdit && !!b} /> Active</label>
            {(b ? canEdit : me.can("brands.create")) && <button className="h-9 rounded-md bg-ink px-3 text-xs font-medium text-white">{b ? "Enregistrer" : "Ajouter"}</button>}
            {b && me.can("brands.delete") && <button formAction={deleteBrandAction} className="h-9 rounded-md px-2 text-xs text-danger hover:bg-red-50">Suppr.</button>}
            {b && <span className="text-xs text-steel">{count} prod.</span>}
          </div>
        </form>
      </Td>
    </tr>
  );
  return (
    <>
      <PageHeader title="Marques" />
      <Flash sp={sp} />
      {pending && (
        <Card className="mb-4 border-red-200">
          <form action={deleteBrandAction} className="space-y-3">
            <input type="hidden" name="id" value={pending.b.id} />
            <p className="text-sm text-ink">
              <strong>{pending.count} produit(s)</strong> utilisent la marque « <strong>{pending.b.name}</strong> ». Pour la supprimer,
              choisissez la marque qui recevra ces produits :
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select name="transferTo" required defaultValue="" className={input + " max-w-xs"} data-testid="transfer-to">
                <option value="" disabled>Transférer vers…</option>
                <option value="none">— Sans marque —</option>
                {rows.filter(({ b }) => b.id !== pending.b.id).map(({ b }) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button className={btn.danger}>Transférer et supprimer</button>
              <Link href="/admin/marques" className={btn.outline}>Annuler</Link>
            </div>
            <p className="text-xs text-steel">Sinon, décochez « Active » pour simplement masquer la marque sur le site.</p>
          </form>
        </Card>
      )}
      <Card padded={false}>
        <Table minWidth={900}>
          <thead><tr><Th>Nom</Th><Th>Pays</Th><Th>Logo</Th><Th>Ordre</Th><Th /></tr></thead>
          <tbody>
            {me.can("brands.create") && row()}
            {rows.map(({ b, count }) => row(b, count))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
