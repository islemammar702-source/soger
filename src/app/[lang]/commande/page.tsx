import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutForm } from "@/components/site/checkout-form";
import { PageHero } from "@/components/site/page-hero";
import { getCurrentCustomer } from "@/server/auth/dal";
import { getSettings } from "@/server/settings";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.checkout.crumb, robots: { index: false } };
}

async function Checkout() {
  const [me, settings] = await Promise.all([getCurrentCustomer(), getSettings()]);
  const c = me?.customer;
  return (
    <CheckoutForm
      defaults={{
        loggedIn: !!me,
        name: c ? [c.firstName, c.lastName].filter(Boolean).join(" ") : undefined,
        company: c?.companyName ?? undefined,
        taxId: c?.taxId ?? undefined,
        phone: c?.phone ?? undefined,
        email: c?.email ?? undefined,
        address: c?.address ?? undefined,
        city: c?.city ?? undefined,
        governorate: c?.governorate ?? undefined,
        postalCode: c?.postalCode ?? undefined,
      }}
      deliveryFee={Number(settings.sales.deliveryFee) || 0}
      freeDeliveryFrom={Number(settings.sales.freeDeliveryFrom) || null}
      bank={settings.company.bank}
    />
  );
}

export default async function CheckoutPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHero title={t.checkout.title} crumbs={[{ href: "/panier", label: t.cart.title }, { href: "/commande", label: t.checkout.crumb }]} />
      <section className="container-soger py-10 lg:py-14">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-mist" />}>
          <Checkout />
        </Suspense>
      </section>
    </>
  );
}
