import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/admin/ui";
import { getBrandOptions, getCategoryOptions } from "@/server/admin/catalog-queries";
import { requireStaff } from "@/server/auth/dal";
import { getSettings } from "@/server/settings";

export default async function NewProductPage() {
  const me = await requireStaff("products.create");
  const [categories, brands, settings] = await Promise.all([getCategoryOptions(), getBrandOptions(), getSettings()]);
  return (
    <>
      <PageHeader title="Nouveau produit" back={{ href: "/admin/produits", label: "Produits" }} />
      <ProductForm
        categories={categories}
        brands={brands}
        canPublish={me.can("products.publish")}
        canSeeCost={me.can("products.view_cost")}
        values={{
          sku: "", manufacturerRef: "", barcode: "", name: "", slug: "", shortDescription: "", description: "", categoryId: "", brandId: "",
          unit: "pièce", purchasePrice: "", salePrice: "", proPrice: "", vatRate: settings.sales.defaultVatRate, minStock: "0", weightKg: "",
          status: "draft", isFeatured: false, isNew: true, isActive: true, attributes: [], equivalents: "", compatibles: "",
        }}
      />
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
