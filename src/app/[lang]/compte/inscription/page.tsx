import type { Metadata } from "next";
import { RegisterForm } from "@/components/site/auth-forms";
import { PageHero } from "@/components/site/page-hero";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.registerTitle, robots: { index: false } };
}

export default async function RegisterPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHero title={t.auth.registerTitle} description={t.auth.registerText} crumbs={[{ href: "/compte/inscription", label: t.auth.registerCrumb }]} />
      <section className="container-soger flex justify-center py-12">
        <div className="w-full max-w-2xl rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft sm:p-8">
          <RegisterForm />
        </div>
      </section>
    </>
  );
}
