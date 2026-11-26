import Link from "next/link";
import {
  ArrowRight, Clock, Cog, Droplets, FileText, Gauge, Headset, Layers, MapPin, Phone,
  ShieldCheck, Sprout, Tags, Truck, Wrench,
} from "lucide-react";
import { HeroVisual } from "@/components/three/hero-visual";
import { ButtonLink } from "@/components/ui/button";
import { CategoryIcon } from "@/components/site/category-icon";
import { ProductCard } from "@/components/site/product-card";
import { QuoteForm } from "@/components/site/quote-form";
import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section";
import { site, whatsappLink } from "@/config/site";
import { getBrands, getCategories, getFeaturedProducts, getNewProducts } from "@/server/catalog";

export default async function HomePage() {
  const [categories, featured, latest, brands] = await Promise.all([
    getCategories(),
    getFeaturedProducts(8),
    getNewProducts(4),
    getBrands(),
  ]);
  const industrial = categories.filter((c) => c.sector === "industrial");
  const agricultural = categories.filter((c) => c.sector === "agricultural");
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));

  return (
    <>
      {/* 1 — Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <div className="bg-blueprint absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_75%)]" />
        <div className="absolute top-1/2 right-[-10%] -z-10 size-[620px] -translate-y-1/2 rounded-full bg-accent/15 blur-[120px]" />
        <div className="container-soger grid min-h-[calc(100svh-7rem)] items-center gap-6 py-12 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="animate-fade-up relative z-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_2px] shadow-accent/60" />
              Distributeur de fournitures industrielles
            </p>
            <h1 className="metal-text mt-6 text-4xl leading-[1.05] font-bold sm:text-5xl xl:text-6xl">
              Votre partenaire en matériel et solutions industrielles
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
              Découvrez notre gamme de fournitures industrielles, pièces mécaniques, composants hydrauliques et équipements professionnels.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/industrie" size="lg">
                Découvrir nos produits <ArrowRight />
              </ButtonLink>
              <ButtonLink href="#devis" size="lg" variant="ghostLight">
                <FileText /> Demander un devis
              </ButtonLink>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
              {[
                { v: industrial.length, l: "familles industrielles" },
                { v: brands.length, l: "marques distribuées" },
                { v: agricultural.length, l: "rayons agricoles" },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="sr-only">{s.l}</dt>
                  <dd className="font-display text-3xl font-bold text-white">{s.v}</dd>
                  <dd className="mt-1 text-xs leading-snug text-white/50">{s.l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroVisual className="relative -mx-4 aspect-square max-h-[620px] w-[calc(100%+2rem)] sm:mx-auto sm:w-full lg:aspect-auto lg:h-[620px]" />
        </div>
      </section>

      {/* 2 — Présentation */}
      <section className="border-b border-line bg-white">
        <div className="container-soger grid gap-10 py-16 lg:grid-cols-[1fr_1.2fr] lg:py-20">
          <Reveal>
            <SectionHeading eyebrow="SOGER" title="Société Générale de Roulement" />
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-lg leading-relaxed text-graphite">
              Nous accompagnons les industriels, ateliers de maintenance, garages, artisans et agriculteurs avec une offre complète en roulements, transmission, hydraulique et pièces de rechange.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { icon: Layers, t: "Large gamme", d: "Des milliers de références industrielles." },
                { icon: Headset, t: "Conseil technique", d: "Aide à l'identification des pièces." },
                { icon: Tags, t: "Tarifs pros", d: "Conditions dédiées aux entreprises." },
              ].map(({ icon: Icon, t, d }) => (
                <div key={t} className="rounded-xl bg-mist p-4">
                  <Icon className="size-5 text-accent" />
                  <p className="mt-3 text-sm font-semibold">{t}</p>
                  <p className="mt-1 text-sm text-steel">{d}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* 3 — Catégories industrielles */}
      <section className="bg-mist/60 py-16 lg:py-24">
        <div className="container-soger">
          <SectionHeading eyebrow="Industrie" title="Nos familles de produits" description="Composants mécaniques, hydrauliques et fournitures pour la maintenance industrielle." href="/industrie" />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {industrial.map((c, i) => (
              <Reveal key={c.slug} delay={Math.min(i, 9) * 0.03}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift sm:p-5"
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-ink to-graphite text-white transition-colors duration-300 group-hover:from-accent group-hover:to-accent-hover">
                    <CategoryIcon name={c.icon} className="size-6" />
                  </span>
                  <span className="mt-4 text-sm leading-snug font-semibold text-ink sm:text-[15px]">{c.name}</span>
                  <span className="mt-1 text-xs text-steel">{c.productCount} produit{c.productCount > 1 ? "s" : ""}</span>
                  <ArrowRight className="absolute top-4 right-4 size-4 -translate-x-1 text-accent opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — Produits populaires */}
      {featured.length > 0 && (
        <section className="py-16 lg:py-24">
          <div className="container-soger">
            <SectionHeading eyebrow="Sélection" title="Produits populaires" href="/produits" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} icon={iconOf.get(p.categorySlug ?? "")} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5 — Nouveautés */}
      {latest.length > 0 && (
        <section className="border-y border-line bg-mist/60 py-16 lg:py-20">
          <div className="container-soger">
            <SectionHeading eyebrow="Nouveau" title="Nouveautés" href="/produits?tri=nouveautes" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {latest.map((p) => (
                <ProductCard key={p.id} product={p} icon={iconOf.get(p.categorySlug ?? "")} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6 — Marques */}
      <section className="py-16 lg:py-20">
        <div className="container-soger">
          <SectionHeading eyebrow="Marques" title="Les marques que nous distribuons" href="/marques" />
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
            {brands.map((b) => (
              <Link
                key={b.slug}
                href={`/produits?marque=${b.slug}`}
                className="grid h-20 place-items-center bg-white px-3 text-center font-display text-base font-bold tracking-tight text-steel transition hover:bg-mist hover:text-ink"
              >
                {b.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 7 — Solutions industrielles */}
      <section className="relative isolate overflow-hidden bg-ink py-16 text-white lg:py-24">
        <div className="bg-blueprint absolute inset-0 -z-10 opacity-60" />
        <div className="container-soger">
          <SectionHeading tone="light" eyebrow="Solutions" title="Des solutions pour chaque atelier" description="Nous vous aidons à choisir les bons composants pour vos équipements." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Wrench, t: "Maintenance industrielle", d: "Roulements, paliers, outillage de montage et lubrification.", href: "/categories/equipements-maintenance" },
              { icon: Cog, t: "Transmission de puissance", d: "Courroies, chaînes, pignons, poulies et accouplements.", href: "/categories/transmission-mecanique" },
              { icon: Gauge, t: "Hydraulique", d: "Vérins, distributeurs, flexibles, raccords et joints.", href: "/categories/hydraulique" },
              { icon: Droplets, t: "Pompage et fluides", d: "Pompes, garnitures mécaniques, tuyauterie et huiles.", href: "/categories/pompes-industrielles" },
            ].map(({ icon: Icon, t, d, href }, i) => (
              <Reveal key={t} delay={i * 0.06}>
                <Link href={href} className="group flex h-full flex-col rounded-[var(--radius-card)] border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition hover:border-accent/50 hover:bg-white/[0.06]">
                  <Icon className="size-7 text-accent" strokeWidth={1.6} />
                  <h3 className="mt-6 text-lg font-semibold">{t}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-white/55">{d}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-white/80 group-hover:text-accent">
                    Explorer <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 8 — Espace agricole (activité complémentaire) */}
      <section className="py-16 lg:py-24">
        <div className="container-soger">
          <div className="overflow-hidden rounded-[1.25rem] border border-accent/15 bg-gradient-to-br from-accent-soft/70 via-white to-white">
            <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:p-12">
              <div>
                <span className="grid size-12 place-items-center rounded-xl bg-accent text-white"><Sprout className="size-6" /></span>
                <h2 className="mt-6 text-3xl font-bold">Espace matériel agricole</h2>
                <p className="mt-3 max-w-md leading-relaxed text-steel">
                  Pompes d’irrigation, goutte-à-goutte, courroies et pièces de rechange pour machines agricoles.
                </p>
                <ButtonLink href="/agriculture" variant="dark" className="mt-8">
                  Voir l’espace agricole <ArrowRight />
                </ButtonLink>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {agricultural.map((c) => (
                  <Link key={c.slug} href={`/categories/${c.slug}`} className="group flex items-center gap-3 rounded-xl border border-line bg-white/80 p-3 transition hover:border-accent/40 hover:bg-white">
                    <CategoryIcon name={c.icon} className="size-5 shrink-0 text-accent" />
                    <span className="text-sm leading-tight font-medium text-graphite group-hover:text-ink">{c.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9 — Avantages */}
      <section className="border-y border-line bg-mist/60 py-14">
        <div className="container-soger grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShieldCheck, t: "Marques reconnues", d: "Des composants de fabricants de référence." },
            { icon: Headset, t: "Conseil et équivalences", d: "Nous trouvons la pièce compatible avec votre référence." },
            { icon: Tags, t: "Particuliers et professionnels", d: "Tarifs et facturation adaptés aux entreprises." },
            { icon: Truck, t: "Retrait ou livraison", d: "En magasin ou livré selon votre besoin." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-accent shadow-soft"><Icon className="size-5" /></span>
              <div>
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-sm text-steel">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 10 — Demande de devis */}
      <section id="devis" className="scroll-mt-24 py-16 lg:py-24">
        <div className="container-soger grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionHeading eyebrow="Devis" title="Demandez un devis" description="Indiquez vos références ou décrivez la pièce recherchée : nous préparons une offre adaptée à vos quantités." />
            <ul className="mt-8 space-y-3 text-sm text-graphite">
              {["Réponse par un conseiller", "Tarifs dégressifs selon les quantités", "Recherche d'équivalences toutes marques"].map((t) => (
                <li key={t} className="flex items-center gap-2.5"><span className="size-1.5 rounded-full bg-accent" />{t}</li>
              ))}
            </ul>
          </div>
          <QuoteForm />
        </div>
      </section>

      {/* 11 — Contact & localisation */}
      <ContactSection />
    </>
  );
}

function ContactSection() {
  const { contact } = site;
  const wa = whatsappLink("Bonjour SOGER, je souhaite un renseignement.");
  return (
    <section className="bg-graphite py-16 text-white lg:py-20">
      <div className="container-soger grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading tone="light" eyebrow="Contact" title="Passez au magasin ou appelez-nous" />
          <ul className="mt-8 space-y-5">
            <li className="flex gap-4">
              <MapPin className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-medium">Adresse</p>
                <p className="text-sm text-white/60">{[contact.address, contact.city].filter(Boolean).join(", ")}</p>
              </div>
            </li>
            {contact.phone && (
              <li className="flex gap-4">
                <Phone className="mt-0.5 size-5 shrink-0 text-accent" />
                <div>
                  <p className="font-medium">Téléphone</p>
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="text-sm text-white/60 hover:text-white">{contact.phone}</a>
                </div>
              </li>
            )}
            <li className="flex gap-4">
              <Clock className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-medium">Horaires</p>
                {contact.hours.map((h) => (
                  <p key={h.days} className="text-sm text-white/60">{h.days} : {h.time}</p>
                ))}
              </div>
            </li>
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/contact">Nous contacter</ButtonLink>
            {wa && <ButtonLink href={wa} variant="ghostLight" target="_blank" rel="noopener">WhatsApp</ButtonLink>}
            {contact.mapsUrl && <ButtonLink href={contact.mapsUrl} variant="ghostLight" target="_blank" rel="noopener">Itinéraire</ButtonLink>}
          </div>
        </div>
        <div className="bg-blueprint relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-ink">
          <div className="flex flex-col items-center text-center">
            <span className="grid size-14 place-items-center rounded-full bg-accent shadow-[0_0_0_10px_rgb(22_163_74/0.2)]"><MapPin className="size-6" /></span>
            <p className="mt-5 font-display text-lg font-semibold">SOGER</p>
            <p className="text-sm text-white/55">{contact.city}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
