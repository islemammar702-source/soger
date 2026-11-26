import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/site/auth-forms";
import { PageHero } from "@/components/site/page-hero";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.loginTitle, robots: { index: false } };
}

async function Form({ searchParams }: { searchParams: PageProps<"/[lang]/compte/connexion">["searchParams"] }) {
  const sp = await searchParams;
  return <LoginForm area="customer" next={typeof sp.suite === "string" ? sp.suite : undefined} />;
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/compte/connexion">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHero title={t.auth.loginTitle} crumbs={[{ href: "/compte", label: t.account.area }]} />
      <section className="container-soger flex justify-center py-12">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft sm:p-8">
          <Suspense fallback={<LoginForm area="customer" />}>
            <Form searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
    </>
  );
}
