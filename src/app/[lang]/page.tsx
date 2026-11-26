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
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { getBrands, getCategories, getFeaturedProducts, getNewProducts } from "@/server/catalog";

export default async function HomePage() {
  const { t, plural, category } = await getI18n();
  const h = t.home;
  const [categories, featured, latest, brands] = await Promise.all([
    getCategories(),
    getFeaturedProducts(8),
    getNewProducts(4),
    getBrands(),
  ]);
  const named = (c: (typeof categories)[number]) => ({ ...c, name: category(c.slug, c.name) });
  const industrial = categories.filter((c) => c.sector === "industrial").map(named);
  const agricultural = categories.filter((c) => c.sector === "agricultural").map(named);
  const iconOf = new Map(categories.map((c) => [c.slug, c.icon]));

  const features = [Layers, Headset, Tags].map((icon, i) => ({ icon, ...h.features[i] }));
  const solutions = ([
    [Wrench, "/categories/equipements-maintenance"],
    [Cog, "/categories/transmission-mecanique"],
    [Gauge, "/categories/hydraulique"],
    [Droplets, "/categories/pompes-industrielles"],
  ] as const).map(([icon, href], i) => ({ icon, href, ...h.solutions[i] }));
  const advantages = [ShieldCheck, Headset, Tags, Truck].map((icon, i) => ({ icon, ...h.advantages[i] }));

  return (
    <>
      {/* 1 — Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <div className="bg-blueprint absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_75%)]" />
        <div className="absolute end-[-10%] top-1/2 -z-10 size-[620px] -translate-y-1/2 rounded-full bg-accent/15 blur-[120px]" />
        <div className="container-soger grid min-h-[calc(100svh-7rem)] items-center gap-6 py-12 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="animate-fade-up relative z-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_2px] shadow-accent/60" />
              {h.heroBadge}
            </p>
            <h1 className="metal-text mt-6 text-4xl leading-[1.05] font-bold sm:text-5xl xl:text-6xl rtl:leading-[1.3]">{h.heroTitle}</h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">{h.heroText}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/industrie" size="lg">
                {h.discover} <ArrowRight className="rtl:rotate-180" />
              </ButtonLink>
              <ButtonLink href="#devis" size="lg" variant="ghostLight">
                <FileText /> {t.common.requestQuote}
              </ButtonLink>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
              {[
                { v: industrial.length, l: h.statIndustrial },
                { v: brands.length, l: h.statBrands },
                { v: agricultural.length, l: h.statAgri },
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
            <SectionHeading eyebrow={h.aboutEyebrow} title={h.aboutTitle} />
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-lg leading-relaxed text-graphite">{h.aboutText}</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {features.map(({ icon: Icon, t: title, d }) => (
                <div key={title} className="rounded-xl bg-mist p-4">
                  <Icon className="size-5 text-accent" />
                  <p className="mt-3 text-sm font-semibold">{title}</p>
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
          <SectionHeading eyebrow={h.industryEyebrow} title={h.industryTitle} description={h.industryText} href="/industrie" />
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
                  <span className="mt-1 text-xs text-steel">{plural(t.common.productCount, c.productCount)}</span>
                  <ArrowRight className="absolute end-4 top-4 size-4 text-accent opacity-0 transition duration-300 group-hover:opacity-100 rtl:rotate-180" />
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
            <SectionHeading eyebrow={h.popularEyebrow} title={h.popularTitle} href="/produits" />
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
            <SectionHeading eyebrow={h.newEyebrow} title={h.newTitle} href="/produits?tri=nouveautes" />
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
          <SectionHeading eyebrow={h.brandsEyebrow} title={h.brandsTitle} href="/marques" />
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
          <SectionHeading tone="light" eyebrow={h.solutionsEyebrow} title={h.solutionsTitle} description={h.solutionsText} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {solutions.map(({ icon: Icon, t: title, d, href }, i) => (
              <Reveal key={title} delay={i * 0.06}>
                <Link href={href} className="group flex h-full flex-col rounded-[var(--radius-card)] border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition hover:border-accent/50 hover:bg-white/[0.06]">
                  <Icon className="size-7 text-accent" strokeWidth={1.6} />
                  <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-white/55">{d}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-white/80 group-hover:text-accent">
                    {t.common.explore} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
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
                <h2 className="mt-6 text-3xl font-bold">{h.agriTitle}</h2>
                <p className="mt-3 max-w-md leading-relaxed text-steel">{h.agriText}</p>
                <ButtonLink href="/agriculture" variant="dark" className="mt-8">
                  {h.agriCta} <ArrowRight className="rtl:rotate-180" />
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
          {advantages.map(({ icon: Icon, t: title, d }) => (
            <div key={title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-accent shadow-soft"><Icon className="size-5" /></span>
              <div>
                <p className="font-semibold">{title}</p>
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
            <SectionHeading eyebrow={h.quoteEyebrow} title={h.quoteTitle} description={h.quoteText} />
            <ul className="mt-8 space-y-3 text-sm text-graphite">
              {h.quoteBullets.map((b) => (
                <li key={b} className="flex items-center gap-2.5"><span className="size-1.5 rounded-full bg-accent" />{b}</li>
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

async function ContactSection() {
  const { t } = await getI18n();
  const h = t.home;
  const { contact } = site;
  const wa = whatsappLink(h.waMessage);
  return (
    <section className="bg-graphite py-16 text-white lg:py-20">
      <div className="container-soger grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading tone="light" eyebrow={h.contactEyebrow} title={h.contactTitle} />
          <ul className="mt-8 space-y-5">
            <li className="flex gap-4">
              <MapPin className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-medium">{h.address}</p>
                <p className="text-sm text-white/60">{[contact.address, contact.city].filter(Boolean).join(", ")}</p>
              </div>
            </li>
            {contact.phone && (
              <li className="flex gap-4">
                <Phone className="mt-0.5 size-5 shrink-0 text-accent" />
                <div>
                  <p className="font-medium">{h.phone}</p>
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} dir="ltr" className="text-sm text-white/60 hover:text-white">{contact.phone}</a>
                </div>
              </li>
            )}
            <li className="flex gap-4">
              <Clock className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="font-medium">{h.hours}</p>
                {contact.hours.map((hr) => (
                  <p key={hr.days} className="text-sm text-white/60">{t.hours[hr.days]} : <span dir="ltr">{hr.time}</span></p>
                ))}
              </div>
            </li>
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/contact">{h.contactUs}</ButtonLink>
            {wa && <ButtonLink href={wa} variant="ghostLight" target="_blank" rel="noopener">{h.whatsapp}</ButtonLink>}
            {contact.mapsUrl && <ButtonLink href={contact.mapsUrl} variant="ghostLight" target="_blank" rel="noopener">{h.directions}</ButtonLink>}
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
