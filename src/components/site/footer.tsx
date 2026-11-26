import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { site } from "@/config/site";
import { cacheLife } from "next/cache";
import { Logo } from "./logo";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

type FooterCategory = { slug: string; name: string };

export function Footer({ industrial, agricultural }: { industrial: FooterCategory[]; agricultural: FooterCategory[] }) {
  const { contact } = site;
  return (
    <footer className="mt-auto bg-ink text-white/70">
      <div className="container-soger grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo tone="light" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed">
            Fournitures industrielles, pièces mécaniques, composants hydrauliques et matériel agricole pour les professionnels et les particuliers.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm">
            {contact.phone && (
              <li className="flex items-center gap-2.5"><Phone className="size-4 text-accent" aria-hidden /><a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="hover:text-white">{contact.phone}</a></li>
            )}
            {contact.email && (
              <li className="flex items-center gap-2.5"><Mail className="size-4 text-accent" aria-hidden /><a href={`mailto:${contact.email}`} className="hover:text-white">{contact.email}</a></li>
            )}
            <li className="flex items-start gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /><span>{[contact.address, contact.city].filter(Boolean).join(", ")}</span></li>
          </ul>
        </div>

        <FooterColumn title="Industrie" links={industrial.slice(0, 8).map((c) => ({ href: `/categories/${c.slug}`, label: c.name }))} />
        <FooterColumn title="Agriculture" links={agricultural.map((c) => ({ href: `/categories/${c.slug}`, label: c.name }))} />
        <FooterColumn
          title="SOGER"
          links={[
            { href: "/a-propos", label: "À propos" },
            { href: "/marques", label: "Nos marques" },
            { href: "/devis", label: "Demande de devis" },
            { href: "/contact", label: "Contact" },
            { href: "/compte", label: "Espace client" },
          ]}
        />
      </div>
      <div className="border-t border-white/10">
        <div className="container-soger flex flex-col gap-2 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© <CurrentYear /> {site.legalName}. Tous droits réservés.</p>
          <p>Les marques citées appartiennent à leurs propriétaires respectifs.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold tracking-wide text-white">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="transition-colors hover:text-white">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
