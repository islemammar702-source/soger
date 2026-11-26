import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Copy, EyeOff, ExternalLink, RotateCcw, Send } from "lucide-react";
import { ImageManager } from "@/components/admin/image-manager";
import { ProductForm } from "@/components/admin/product-form";
import { Card, Flash, PageHeader, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { duplicateProductAction, setProductStatusAction } from "@/server/admin/products";
import { getAdminProduct, getBrandOptions, getCategoryOptions, getDefaultWarehouse } from "@/server/admin/catalog-queries";
import { storageMode } from "@/server/uploads";

const STATUS: Record<string, [string, string]> = {
  draft: ["Brouillon — non visible sur le site", "bg-steel/10 text-graphite"],
  published: ["Publié sur le site", "bg-accent-soft text-accent-hover"],
  archived: ["Archivé — conservé dans l'historique", "bg-red-50 text-red-700"],
};
import { requireStaff } from "@/server/auth/dal";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/produits/[id]">) {
  const me = await requireStaff("products.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [data, categories, brands, warehouse] = await Promise.all([getAdminProduct(id), getCategoryOptions(), getBrandOptions(), getDefaultWarehouse()]);
  if (!data) notFound();
  const { p, attributes, images, relations, stockRows } = data;
  const canEdit = me.can("products.update");
  const totalOnHand = stockRows.reduce((s, r) => s + Number(r.onHand), 0);
  const totalReserved = stockRows.reduce((s, r) => s + Number(r.reserved), 0);
  const canPublish = me.can("products.publish");
  const statusForm = (status: string, label: React.ReactNode, cls: string) => (
    <form action={setProductStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={status} /><button className={cls}>{label}</button></form>
  );
  const defaultStock = warehouse ? stockRows.find((r) => r.warehouseId === warehouse.id) : undefined;
  return (
    <>
      <PageHeader
        title={p.name}
        description={<span className="font-mono">{p.sku}</span>}
        back={{ href: "/admin/produits", label: "Produits" }}
        actions={
          <>
            <Badge tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Badge>
            {p.status === "published" && <Link href={`/produits/${p.slug}`} target="_blank" className={btn.outline}><ExternalLink className="size-4" /> Voir sur le site</Link>}
            {me.can("products.create") && (
              <form action={duplicateProductAction}><input type="hidden" name="id" value={p.id} /><button className={btn.outline}><Copy className="size-4" /> Dupliquer</button></form>
            )}
            {canEdit && canPublish && p.status === "published" && statusForm("draft", <><EyeOff className="size-4" /> Dépublier</>, btn.outline)}
            {canEdit && canPublish && p.status === "draft" && statusForm("published", <><Send className="size-4" /> Publier</>, btn.primary)}
            {canEdit && p.status === "archived" && statusForm("draft", <><RotateCcw className="size-4" /> Restaurer</>, btn.outline)}
            {canEdit && p.status !== "archived" && (p.status !== "published" || canPublish) && statusForm("archived", <><Archive className="size-4" /> Archiver</>, btn.danger)}
          </>
        }
      />
      <Flash sp={sp} />
      <div className="mb-6">
        <Card title="Stock par dépôt" actions={me.can("stock.adjust") && <Link href={`/admin/stock/operations?produit=${encodeURIComponent(p.sku)}`} className="text-xs font-medium text-accent">Mouvement de stock</Link>}>
          {stockRows.length ? (
            <ul className="space-y-1.5 text-sm">
              {stockRows.map((r) => (
                <li key={r.code} className="flex justify-between"><span>{r.warehouse}{r.location ? ` · ${r.location}` : ""}</span><span className="tabular-nums">{Number(r.onHand)} physique · {Number(r.reserved)} réservé</span></li>
              ))}
              <li className="flex justify-between border-t border-line pt-1.5 font-semibold"><span>Disponible</span><span className="tabular-nums">{totalOnHand - totalReserved} {p.unit}</span></li>
            </ul>
          ) : (
            <p className="text-sm text-steel">Aucun stock enregistré.</p>
          )}
          <Link href={`/admin/stock/mouvements?produit=${encodeURIComponent(p.sku)}`} className="mt-3 inline-block text-xs font-medium text-accent">Historique des mouvements →</Link>
        </Card>
      </div>
      <Card title={`Images (${images.length})`} className="mb-6">
        <ImageManager productId={p.id} canEdit={canEdit} storage={storageMode()} images={images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, isPrimary: i.isPrimary }))} />
      </Card>
      {canEdit ? (
        <ProductForm
          key={p.status}
          categories={categories}
          brands={brands}
          canPublish={canPublish}
          canSeeCost={me.can("products.view_cost")}
          canAdjustStock={me.can("stock.adjust")}
          warehouseName={warehouse?.name ?? null}
          values={{
            id: p.id, sku: p.sku, manufacturerRef: p.manufacturerRef ?? "", barcode: p.barcode ?? "", name: p.name, slug: p.slug,
            shortDescription: p.shortDescription ?? "", description: p.description ?? "", categoryId: p.categoryId ? String(p.categoryId) : "",
            brandId: p.brandId ? String(p.brandId) : "", unit: p.unit, purchasePrice: me.can("products.view_cost") ? (p.purchasePrice ?? "") : "", salePrice: p.salePrice ?? "",
            proPrice: p.proPrice ?? "", vatRate: p.vatRate, minStock: String(Number(p.minStock)), weightKg: p.weightKg ?? "", status: p.status,
            isFeatured: p.isFeatured, isNew: p.isNew, isActive: p.isActive,
            attributes: attributes.filter((a) => a.key !== "dimensions").map((a) => ({ key: a.key, label: a.label, value: a.value, unit: a.unit ?? "" })),
            equivalents: relations.filter((r) => r.kind === "equivalent").map((r) => r.sku).join(", "),
            compatibles: relations.filter((r) => r.kind === "compatible").map((r) => r.sku).join(", "),
            dimensions: attributes.find((a) => a.key === "dimensions")?.value ?? "",
            stockQty: defaultStock ? String(Number(defaultStock.onHand)) : "0",
          }}
        />
      ) : (
        <p className="rounded-xl border border-line bg-white p-5 text-sm text-steel">Consultation seule : votre rôle ne permet pas de modifier les produits.</p>
      )}
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
