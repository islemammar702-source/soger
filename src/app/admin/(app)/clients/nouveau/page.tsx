import { CustomerForm } from "@/components/admin/party-forms";
import { PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";

export default async function NewCustomerPage() {
  await requireStaff("customers.create");
  return (
    <>
      <PageHeader title="Nouveau client" back={{ href: "/admin/clients", label: "Clients" }} />
      <CustomerForm values={{ type: "individual", companyName: "", firstName: "", lastName: "", email: "", phone: "", taxId: "", activity: "", address: "", city: "", governorate: "", postalCode: "", creditLimit: "", notes: "", isActive: true }} />
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
