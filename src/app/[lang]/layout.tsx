import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/noto-sans-arabic";
import "../globals.css";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { Toaster } from "@/components/ui/toast";
import { site } from "@/config/site";
import { I18nProvider } from "@/i18n/client";
import { LOCALES, OG_LOCALE } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { getCategories } from "@/server/catalog";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return {
    metadataBase: new URL(site.url),
    title: { default: t.meta.defaultTitle, template: `%s · ${site.name}` },
    description: t.meta.description,
    openGraph: { type: "website", locale: OG_LOCALE[locale], siteName: t.meta.legalName },
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])) },
  };
}

export const viewport: Viewport = { themeColor: "#111827" };

/** Mise en page racine du site public, une par langue (fr, en, ar — l'arabe s'affiche de droite à gauche). */
export default async function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, dir, t, category } = await getI18n();
  const categories = await getCategories();
  const industrial = categories.filter((c) => c.sector === "industrial").map((c) => ({ ...c, name: category(c.slug, c.name) }));
  const agricultural = categories.filter((c) => c.sector === "agricultural").map((c) => ({ ...c, name: category(c.slug, c.name) }));
  return (
    <html lang={locale} dir={dir} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale} dict={t}>
          <Header categories={industrial.map(({ slug, name }) => ({ slug, name }))} />
          <main className="flex-1">{children}</main>
          <Footer industrial={industrial} agricultural={agricultural} />
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
