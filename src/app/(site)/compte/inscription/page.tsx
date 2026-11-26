import type { Metadata } from "next";
import { RegisterForm } from "@/components/site/auth-forms";
import { PageHero } from "@/components/site/page-hero";

export const metadata: Metadata = { title: "Créer un compte", robots: { index: false } };

export default function RegisterPage() {
  return (
    <>
      <PageHero title="Créer un compte" description="Suivez vos commandes, devis et factures. Les professionnels accèdent à leurs tarifs dédiés." crumbs={[{ href: "/compte/inscription", label: "Inscription" }]} />
      <section className="container-soger flex justify-center py-12">
        <div className="w-full max-w-2xl rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft sm:p-8">
          <RegisterForm />
        </div>
      </section>
    </>
  );
}
