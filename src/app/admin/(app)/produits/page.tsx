import Image from "next/image";
import Link from "next/link";
import { Copy, EyeOff, ImageOff, Plus, Send, Trash2, Upload } from "lucide-react";
import { BulkBar, SelectAll } from "@/components/admin/product-bulk";
import { Card, EmptyRow, FilterBar, Flash, FilterSelect, PageHeader, Pagination, Table, Td, Th, btn, listHref, one } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { formatTND, isOptimizable } from "@/lib/utils";
import { countDeletableProducts, deleteAllProductsAction, duplicateProductAction, setProductStatusAction } from "@/server/admin/products";
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
    listAdminProducts({ q: one(sp.q) || undefined, category: Number(one(sp.categorie)) || undefined, brand: Number(one(sp.marque)) || undefined, status: one(sp.statut) || undefined, alert: one(sp.alerte) === "1", availability: one(sp.dispo) || undefined, page }),
    getCategoryOptions(),
    getBrandOptions(),
  ]);
  const canEdit = me.can("products.update");
  const canPublish = me.can("products.publish");
  const back = listHref("/admin/produits", sp, { ok: undefined, erreur: undefined });
  const canDelete = me.can("products.delete");
  const purge = canDelete && one(sp["tout-supprimer"]) === "1" ? await countDeletableProducts() : null;
  return (
    <>
      <PageHeader
        title="Produits"
        description={`${total} produit(s)`}
        actions={
          <>
            {me.can("products.import") && <Link href="/admin/import" className={btn.outline}><Upload className="size-4" /> Importer</Link>}
            {canDelete && <Link href="/admin/produits?tout-supprimer=1" className={btn.danger} data-testid="delete-all"><Trash2 className="size-4" /> Tout supprimer</Link>}
            {me.can("products.create") && <Link href="/admin/produits/nouveau" className={btn.primary}><Plus className="size-4" /> Nouveau produit</Link>}
          </>
        }
      />
      <FilterBar action="/admin/produits" q={one(sp.q)} placeholder="Référence, désignation, réf. fabricant, code-barres…">
        <FilterSelect name="categorie" label="Toutes catégories" value={one(sp.categorie)} options={cats.map((c) => [String(c.id), c.name])} />
        <FilterSelect name="marque" label="Toutes marques" value={one(sp.marque)} options={brands.map((b) => [String(b.id), b.name])} />
        <FilterSelect name="statut" label="Actifs (hors archives)" value={one(sp.statut)} options={[["published", "Publiés"], ["draft", "Brouillons"], ["archived", "Archivés"], ["inactive", "Désactivés"]]} />
        <FilterSelect name="dispo" label="Toute disponibilité" value={one(sp.dispo)} options={[["en_stock", "En stock"], ["faible", "Stock faible"], ["rupture", "Rupture"]]} />
        {one(sp.alerte) === "1" && <input type="hidden" name="alerte" value="1" />}
      </FilterBar>
      <Flash sp={sp} />
      {purge && (
        <Card className="mb-4 border-red-200">
          {purge.total === 0 ? (
            <p className="text-sm text-steel">Aucun produit à supprimer. <Link href="/admin/produits" className="underline">Retour</Link></p>
          ) : (
            <form action={deleteAllProductsAction} className="space-y-3">
              <p className="text-base font-semibold text-danger">Supprimer tous les produits ({purge.total})</p>
              <ul className="list-disc space-y-1 ps-5 text-sm text-ink">
                <li><strong>{purge.deletable}</strong> produit(s) seront <strong>supprimés définitivement</strong> (fiche, photos, caractéristiques, stock).</li>
                {purge.withHistory > 0 && (
                  <li><strong>{purge.withHistory}</strong> produit(s) apparaissent dans des ventes, factures, devis ou achats : ils seront <strong>archivés</strong> (retirés du site et de la caisse) car ces documents doivent être conservés pour la comptabilité.</li>
                )}
                <li>Les catégories, marques, clients, ventes et factures ne sont pas touchés.</li>
              </ul>
              <p className="text-sm text-danger">Cette action est irréversible. Pour confirmer, tapez <strong>SUPPRIMER</strong> :</p>
              <div className="flex flex-wrap items-center gap-2">
                <input name="confirm" required autoComplete="off" placeholder="Écrivez le mot ici…" aria-label="Tapez SUPPRIMER pour confirmer" title="Tapez SUPPRIMER pour confirmer" className="h-10 w-56 rounded-lg border-2 border-red-300 px-3 text-sm font-semibold uppercase placeholder:font-normal placeholder:normal-case focus:border-danger focus:outline-none" data-testid="confirm-delete" />
                <button className={btn.danger}>Supprimer tous les produits</button>
                <Link href="/admin/produits" className={btn.outline}>Annuler</Link>
              </div>
            </form>
          )}
        </Card>
      )}
      {canEdit && <BulkBar back={back} canPublish={canPublish} categories={cats} brands={brands} />}
      <Card padded={false}>
        <Table minWidth={1100}>
          <thead><tr>{canEdit && <Th className="w-8"><SelectAll /></Th>}<Th className="w-14">Photo</Th><Th>Référence</Th><Th>Désignation</Th><Th>Marque</Th><Th>Catégorie</Th><Th className="text-right">Prix HT</Th><Th className="text-right">Prix pro HT</Th><Th className="text-right">Stock dispo.</Th><Th>Statut</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={11} />}
            {rows.map((p) => {
              const avail = Number(p.available);
              return (
                <tr key={p.id} className="hover:bg-mist/40">
                  {canEdit && <Td><input type="checkbox" form="bulk" name="ids" value={p.id} aria-label={`Sélectionner ${p.sku}`} className="size-4 accent-[var(--color-accent)]" /></Td>}
                  <Td>
                    <span className="relative grid size-11 place-items-center overflow-hidden rounded-md border border-line bg-mist">
                      {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="44px" className="object-contain p-0.5" unoptimized={!isOptimizable(p.imageUrl)} /> : <ImageOff className="size-4 text-steel/50" />}
                    </span>
                  </Td>
                  <Td><Link href={`/admin/produits/${p.id}`} className="font-mono text-xs font-semibold text-accent hover:underline">{p.sku}</Link>{p.manufacturerRef && <span className="block font-mono text-[11px] text-steel">{p.manufacturerRef}</span>}</Td>
                  <Td className="max-w-xs"><Link href={`/admin/produits/${p.id}`} className="line-clamp-2 hover:text-accent">{p.name}</Link></Td>
                  <Td className="text-steel">{p.brand ?? "—"}</Td>
                  <Td className="text-steel">{p.category ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatTND(p.salePrice)}</Td>
                  <Td className="text-right text-steel tabular-nums">{p.proPrice ? formatTND(p.proPrice) : "—"}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${avail <= 0 ? "text-danger" : avail <= Number(p.minStock) ? "text-amber-700" : ""}`}>{avail} <span className="text-xs font-normal text-steel">{p.unit}</span></Td>
                  <Td>
                    <Badge tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Badge>
                    {!p.isActive && <Badge tone="bg-red-50 text-red-700" className="ml-1">Désactivé</Badge>}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {canEdit && canPublish && p.status !== "archived" && (
                        <form action={setProductStatusAction}>
                          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} />
                          <input type="hidden" name="status" value={p.status === "published" ? "draft" : "published"} />
                          <button title={p.status === "published" ? "Dépublier" : "Publier"} aria-label={`${p.status === "published" ? "Dépublier" : "Publier"} ${p.sku}`} className="grid size-8 place-items-center rounded-md border border-line text-graphite hover:bg-mist">
                            {p.status === "published" ? <EyeOff className="size-4" /> : <Send className="size-4" />}
                          </button>
                        </form>
                      )}
                      {me.can("products.create") && (
                        <form action={duplicateProductAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button title="Dupliquer" aria-label={`Dupliquer ${p.sku}`} className="grid size-8 place-items-center rounded-md border border-line text-graphite hover:bg-mist"><Copy className="size-4" /></button>
                        </form>
                      )}
                    </div>
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

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
