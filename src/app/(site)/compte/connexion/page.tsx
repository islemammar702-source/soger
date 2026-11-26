import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/site/auth-forms";
import { PageHero } from "@/components/site/page-hero";

export const metadata: Metadata = { title: "Connexion", robots: { index: false } };

async function Form({ searchParams }: { searchParams: PageProps<"/compte/connexion">["searchParams"] }) {
  const sp = await searchParams;
  return <LoginForm area="customer" next={typeof sp.suite === "string" ? sp.suite : undefined} />;
}

export default function LoginPage({ searchParams }: PageProps<"/compte/connexion">) {
  return (
    <>
      <PageHero title="Connexion" crumbs={[{ href: "/compte", label: "Espace client" }]} />
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
