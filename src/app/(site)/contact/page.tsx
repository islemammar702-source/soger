import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { QuoteForm } from "@/components/site/quote-form";
import { site, whatsappLink } from "@/config/site";

export const metadata: Metadata = { title: "Contact", description: "Contactez SOGER : magasin, téléphone, WhatsApp et e-mail." };

export default function ContactPage() {
  const { contact } = site;
  const wa = whatsappLink("Bonjour SOGER, je souhaite un renseignement.");
  const items = [
    { icon: MapPin, label: "Adresse", value: [contact.address, contact.city].filter(Boolean).join(", "), href: contact.mapsUrl || undefined },
    contact.phone && { icon: Phone, label: "Téléphone", value: contact.phone, href: `tel:${contact.phone.replace(/\s/g, "")}` },
    wa && { icon: MessageCircle, label: "WhatsApp", value: "Écrire sur WhatsApp", href: wa },
    contact.email && { icon: Mail, label: "E-mail", value: contact.email, href: `mailto:${contact.email}` },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string; href?: string }[];

  return (
    <>
      <PageHero title="Contact" description="Une question technique, une référence à identifier ? Écrivez-nous ou passez au magasin." crumbs={[{ href: "/contact", label: "Contact" }]} />
      <section className="container-soger grid gap-10 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
        <div className="space-y-4">
          {items.map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft">
              <Icon className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-semibold">{label}</p>
                {href ? <a href={href} className="text-sm text-steel hover:text-ink">{value}</a> : <p className="text-sm text-steel">{value}</p>}
              </div>
            </div>
          ))}
          <div className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft">
            <Clock className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold">Horaires</p>
              {contact.hours.map((h) => <p key={h.days} className="text-sm text-steel">{h.days} : {h.time}</p>)}
            </div>
          </div>
        </div>
        <QuoteForm />
      </section>
    </>
  );
}
