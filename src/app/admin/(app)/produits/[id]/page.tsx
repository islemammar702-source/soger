import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Star, Trash2 } from "lucide-react";
import { ImageUploadForm } from "@/components/admin/image-upload";
import { ProductForm } from "@/components/admin/product-form";
import { Card, Flash, PageHeader, btn } from "@/components/admin/ui";
import { isOptimizable } from "@/lib/utils";
import { imageAction, setProductStatusAction } from "@/server/admin/products";
import { getAdminProduct, getBrandOptions, getCategoryOptions } from "@/server/admin/catalog-queries";
import { requireStaff } from "@/server/auth/dal";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/produits/[id]">) {
  const me = await requireStaff("products.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [data, categories, brands] = await Promise.all([getAdminProduct(id), getCategoryOptions(), getBrandOptions()]);
  if (!data) notFound();
  const { p, attributes, images, relations, stockRows } = data;
  const canEdit = me.can("products.update");
  const totalOnHand = stockRows.reduce((s, r) => s + Number(r.onHand), 0);
  const totalReserved = stockRows.reduce((s, r) => s + Number(r.reserved), 0);
  return (
    <>
      <PageHeader
        title={p.name}
        description={<span className="font-mono">{p.sku}</span>}
        back={{ href: "/admin/produits", label: "Produits" }}
        actions={
          <>
            {p.status === "published" && <Link href={`/produits/${p.slug}`} target="_blank" className={btn.outline}><ExternalLink className="size-4" /> Voir sur le site</Link>}
            {canEdit && p.status !== "archived" && (
              <form action={setProductStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="archived" /><button className={btn.danger}>Archiver</button></form>
            )}
            {p.status !== "published" && me.can("products.publish") && (
              <form action={setProductStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="published" /><button className={btn.primary}>Publier</button></form>
            )}
          </>
        }
      />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_1fr]">
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
        <Card title="Images" padded>
          <div id="images" className="mb-4 flex flex-wrap gap-3">
            {images.length === 0 && <p className="text-sm text-steel">Aucune image.</p>}
            {images.map((img) => (
              <div key={img.id} className="relative size-24 overflow-hidden rounded-lg border border-line bg-mist">
                <Image src={img.url} alt={img.alt ?? ""} fill sizes="96px" className="object-contain p-1" unoptimized={!isOptimizable(img.url)} />
                {img.isPrimary && <span className="absolute top-1 left-1 rounded bg-ink px-1.5 text-[10px] text-white">Principale</span>}
                {canEdit && (
                  <div className="absolute right-1 bottom-1 flex gap-1">
                    {!img.isPrimary && (
                      <form action={imageAction}><input type="hidden" name="imageId" value={img.id} /><input type="hidden" name="op" value="primary" /><button aria-label="Image principale" className="grid size-6 place-items-center rounded bg-white/90 text-graphite"><Star className="size-3.5" /></button></form>
                    )}
                    <form action={imageAction}><input type="hidden" name="imageId" value={img.id} /><input type="hidden" name="op" value="delete" /><button aria-label="Supprimer l'image" className="grid size-6 place-items-center rounded bg-white/90 text-danger"><Trash2 className="size-3.5" /></button></form>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canEdit && <ImageUploadForm productId={p.id} uploadEnabled={!!process.env.CLOUDINARY_URL} />}
        </Card>
      </div>
      {canEdit ? (
        <ProductForm
          categories={categories}
          brands={brands}
          canPublish={me.can("products.publish")}
          canSeeCost={me.can("products.view_cost")}
          values={{
            id: p.id, sku: p.sku, manufacturerRef: p.manufacturerRef ?? "", barcode: p.barcode ?? "", name: p.name, slug: p.slug,
            shortDescription: p.shortDescription ?? "", description: p.description ?? "", categoryId: p.categoryId ? String(p.categoryId) : "",
            brandId: p.brandId ? String(p.brandId) : "", unit: p.unit, purchasePrice: p.purchasePrice ?? "", salePrice: p.salePrice ?? "",
            proPrice: p.proPrice ?? "", vatRate: p.vatRate, minStock: String(Number(p.minStock)), weightKg: p.weightKg ?? "", status: p.status,
            isFeatured: p.isFeatured, isNew: p.isNew, isActive: p.isActive,
            attributes: attributes.map((a) => ({ key: a.key, label: a.label, value: a.value, unit: a.unit ?? "" })),
            equivalents: relations.filter((r) => r.kind === "equivalent").map((r) => r.sku).join(", "),
            compatibles: relations.filter((r) => r.kind === "compatible").map((r) => r.sku).join(", "),
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
