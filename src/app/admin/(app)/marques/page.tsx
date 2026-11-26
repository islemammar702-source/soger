import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, products } from "@/db/schema";
import { Card, Flash, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { deleteBrandAction, saveBrandAction } from "@/server/admin/products";
import { requireStaff } from "@/server/auth/dal";

const input = "h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm outline-none focus:border-accent";

export default async function BrandsAdminPage({ searchParams }: PageProps<"/admin/marques">) {
  const me = await requireStaff("brands.view");
  const sp = await searchParams;
  const rows = await db
    .select({ b: brands, count: sql<number>`(select count(*)::int from ${products} p where p.brand_id = ${brands.id})` })
    .from(brands)
    .orderBy(asc(brands.sortOrder), asc(brands.name));
  const canEdit = me.can("brands.update");
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
