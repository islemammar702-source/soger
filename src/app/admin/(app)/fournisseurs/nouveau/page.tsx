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
