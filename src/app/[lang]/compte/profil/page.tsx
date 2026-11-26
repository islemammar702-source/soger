import type { Metadata } from "next";
import { AccountShell } from "@/components/site/account-shell";
import { PasswordForm, ProfileForm } from "@/components/site/profile-forms";
import { isApprovedPro, requireCustomer } from "@/server/auth/dal";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.profileTitle, robots: { index: false } };
}

async function Profile() {
  const { href } = await getI18n();
  const { user, customer } = await requireCustomer(href("/compte/profil"));
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

export default async function ProfilePage() {
  const { t } = await getI18n();
  return (
    <AccountShell title={t.account.profileTitle} current="/compte/profil">
      <Profile />
    </AccountShell>
  );
}
