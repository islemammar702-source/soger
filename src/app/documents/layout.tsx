import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "../globals.css";
import { site } from "@/config/site";

export const metadata: Metadata = { metadataBase: new URL(site.url), title: { default: "Document", template: `%s · ${site.name}` }, robots: { index: false, follow: false } };

/** Documents imprimables (devis, factures, tickets) : en français. */
export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
