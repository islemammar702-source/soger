import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/site/page-hero";
import { QuoteForm } from "@/components/site/quote-form";

export const metadata: Metadata = { title: "Demande de devis", description: "Demandez un devis pour vos fournitures industrielles et pièces de rechange." };

async function PrefilledForm({ searchParams }: { searchParams: PageProps<"/devis">["searchParams"] }) {
  const sp = await searchParams;
  const ref = typeof sp.produit === "string" ? sp.produit.slice(0, 100) : "";
  return <QuoteForm defaultReferences={ref} />;
}

export default function QuotePage({ searchParams }: PageProps<"/devis">) {
  return (
    <>
      <PageHero title="Demande de devis" description="Indiquez vos références, quantités et délais : un conseiller SOGER vous répond avec une offre adaptée." crumbs={[{ href: "/devis", label: "Devis" }]} />
      <section className="container-soger max-w-3xl py-12 lg:py-16">
        <Suspense fallback={<QuoteForm />}>
          <PrefilledForm searchParams={searchParams} />
        </Suspense>
      </section>
    </>
  );
}
