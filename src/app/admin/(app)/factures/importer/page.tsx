import { redirect } from "next/navigation";
import { InvoiceImport } from "@/components/admin/invoice-import";
import { PageHeader } from "@/components/admin/ui";
import { emptyInvoiceDraft } from "@/lib/invoice-draft";
import { requireStaff } from "@/server/auth/dal";
import { aiEnabled } from "@/server/invoice-ai";
import { getSettings } from "@/server/settings";

export default async function ImportSupplierInvoicePage() {
  const me = await requireStaff("invoices.create");
  // Prix d'achat visibles sur une facture fournisseur : réservé aux rôles qui voient les coûts.
  if (!me.can("products.view_cost")) redirect("/admin/acces-refuse?p=products.view_cost");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Importer / scanner une facture" description="PDF ou photo : lecture automatique, vérification, puis enregistrement." back={{ href: "/admin/factures", label: "Factures" }} />
      <InvoiceImport
        aiEnabled={aiEnabled()}
        empty={emptyInvoiceDraft(Number(settings.sales.stampDuty) || 0)}
        perms={{ canPay: me.can("payments.create"), canStock: me.can("stock.receive"), canCreateProduct: me.can("products.create"), canCreateSupplier: me.can("suppliers.create") }}
      />
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
