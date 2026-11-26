import { SupplierForm } from "@/components/admin/party-forms";
import { PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";

export default async function NewSupplierPage() {
  await requireStaff("suppliers.create");
  return (
    <>
      <PageHeader title="Nouveau fournisseur" back={{ href: "/admin/fournisseurs", label: "Fournisseurs" }} />
      <SupplierForm values={{ name: "", contactName: "", email: "", phone: "", taxId: "", address: "", city: "", country: "Tunisie", paymentTermsDays: "30", notes: "", isActive: true }} />
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
