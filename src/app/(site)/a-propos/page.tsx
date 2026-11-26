import type { Metadata } from "next";
import { Cog, Handshake, Sprout, Users } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "À propos", description: "SOGER – Société Générale de Roulement, distributeur de fournitures industrielles." };

export default function AboutPage() {
  return (
    <>
      <PageHero title="À propos de SOGER" description="Société Générale de Roulement : fournitures industrielles, pièces mécaniques et hydrauliques, matériel agricole." crumbs={[{ href: "/a-propos", label: "À propos" }]} />
      <section className="container-soger grid gap-12 py-12 lg:grid-cols-2 lg:py-16">
        <div className="space-y-5 text-lg leading-relaxed text-graphite">
          {/* TODO : remplacer par l'histoire réelle de l'entreprise (date de création, équipe, implantation). */}
          <p>SOGER distribue des composants mécaniques, hydrauliques et des fournitures industrielles pour la maintenance et la production.</p>
          <p>Notre cœur de métier est l’industrie. Nous accompagnons aussi les agriculteurs avec une offre dédiée en irrigation et pièces de rechange agricoles.</p>
          <ButtonLink href="/contact" className="mt-4">Nous contacter</ButtonLink>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { icon: Cog, t: "Industrie d'abord", d: "Roulements, transmission, hydraulique, pompes et outillage." },
            { icon: Users, t: "Tous les profils", d: "Industriels, ateliers, garages, artisans et particuliers." },
            { icon: Handshake, t: "Conseil", d: "Identification de pièces et recherche d'équivalences." },
            { icon: Sprout, t: "Agriculture", d: "Irrigation et pièces pour machines agricoles." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft">
              <Icon className="size-6 text-accent" />
              <p className="mt-4 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-steel">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
