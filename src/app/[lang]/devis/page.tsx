import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/site/page-hero";
import { QuoteForm } from "@/components/site/quote-form";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.quotePage.title, description: t.quotePage.meta };
}

async function PrefilledForm({ searchParams }: { searchParams: PageProps<"/[lang]/devis">["searchParams"] }) {
  const sp = await searchParams;
  const ref = typeof sp.produit === "string" ? sp.produit.slice(0, 100) : "";
  return <QuoteForm defaultReferences={ref} />;
}

export default async function QuotePage({ searchParams }: PageProps<"/[lang]/devis">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHero title={t.quotePage.title} description={t.quotePage.text} crumbs={[{ href: "/devis", label: t.quotePage.crumb }]} />
      <section className="container-soger max-w-3xl py-12 lg:py-16">
        <Suspense fallback={<QuoteForm />}>
          <PrefilledForm searchParams={searchParams} />
        </Suspense>
      </section>
    </>
  );
}
