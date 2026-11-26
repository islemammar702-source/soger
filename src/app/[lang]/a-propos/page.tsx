import type { Metadata } from "next";
import { Cog, Handshake, Sprout, Users } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.about.crumb, description: t.about.meta };
}

export default async function AboutPage() {
  const { t } = await getI18n();
  const cards = [Cog, Users, Handshake, Sprout].map((icon, i) => ({ icon, ...t.about.cards[i] }));
  return (
    <>
      <PageHero title={t.about.title} description={t.about.text} crumbs={[{ href: "/a-propos", label: t.about.crumb }]} />
      <section className="container-soger grid gap-12 py-12 lg:grid-cols-2 lg:py-16">
        <div className="space-y-5 text-lg leading-relaxed text-graphite">
          {/* TODO : remplacer par l'histoire réelle de l'entreprise (date de création, équipe, implantation), dans les 3 langues. */}
          <p>{t.about.p1}</p>
          <p>{t.about.p2}</p>
          <ButtonLink href="/contact" className="mt-4">{t.about.contactUs}</ButtonLink>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map(({ icon: Icon, t: title, d }) => (
            <div key={title} className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft">
              <Icon className="size-6 text-accent" />
              <p className="mt-4 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-steel">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
