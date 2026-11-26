import type { Metadata } from "next";
import { AccountShell } from "@/components/site/account-shell";
import { PasswordForm, ProfileForm } from "@/components/site/profile-forms";
import { isApprovedPro, requireCustomer } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Mon profil", robots: { index: false } };

async function Profile() {
  const { user, customer } = await requireCustomer("/compte/profil");
  return (
    <div className="space-y-8">
      <ProfileForm
        values={{
          name: user.name,
          email: user.email,
          phone: customer.phone ?? "",
          company: customer.companyName ?? "",
          taxId: customer.taxId ?? "",
          activity: customer.activity ?? "",
          address: customer.address ?? "",
          city: customer.city ?? "",
          governorate: customer.governorate ?? "",
          postalCode: customer.postalCode ?? "",
        }}
        professional={customer.type === "professional"}
        taxIdLocked={isApprovedPro(customer)}
      />
      <PasswordForm />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AccountShell title="Mon profil" current="/compte/profil">
      <Profile />
    </AccountShell>
  );
}
