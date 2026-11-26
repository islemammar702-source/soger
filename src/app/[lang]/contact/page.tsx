import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { QuoteForm } from "@/components/site/quote-form";
import { site, whatsappLink } from "@/config/site";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.contactPage.title, description: t.contactPage.meta };
}

export default async function ContactPage() {
  const { t } = await getI18n();
  const c = t.contactPage;
  const { contact } = site;
  const wa = whatsappLink(t.home.waMessage);
  const items = [
    { icon: MapPin, label: c.address, value: [contact.address, contact.city].filter(Boolean).join(", "), href: contact.mapsUrl || undefined },
    contact.phone && { icon: Phone, label: c.phone, value: contact.phone, href: `tel:${contact.phone.replace(/\s/g, "")}`, ltr: true },
    wa && { icon: MessageCircle, label: c.whatsapp, value: c.writeWhatsapp, href: wa },
    contact.email && { icon: Mail, label: c.email, value: contact.email, href: `mailto:${contact.email}`, ltr: true },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string; href?: string; ltr?: boolean }[];

  return (
    <>
      <PageHero title={c.title} description={c.text} crumbs={[{ href: "/contact", label: c.title }]} />
      <section className="container-soger grid gap-10 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
        <div className="space-y-4">
          {items.map(({ icon: Icon, label, value, href, ltr }) => (
            <div key={label} className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft">
              <Icon className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-semibold">{label}</p>
                {href ? <a href={href} dir={ltr ? "ltr" : undefined} className="text-sm text-steel hover:text-ink">{value}</a> : <p className="text-sm text-steel">{value}</p>}
              </div>
            </div>
          ))}
          <div className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft">
            <Clock className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold">{c.hours}</p>
              {contact.hours.map((h) => <p key={h.days} className="text-sm text-steel">{t.hours[h.days]} : <span dir="ltr">{h.time}</span></p>)}
            </div>
          </div>
        </div>
        <QuoteForm />
      </section>
    </>
  );
}
