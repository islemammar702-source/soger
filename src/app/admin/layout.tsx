import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "../globals.css";
import { site } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "Gestion SOGER", template: `%s · ${site.name}` },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#111827" };

/** Mise en page racine de l'espace gestion (toujours en français). */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
