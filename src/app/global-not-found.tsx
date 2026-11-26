/* eslint-disable @next/next/no-html-link-for-pages -- page 404 globale : rendue hors du routeur, liens classiques voulus. */
import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import { LogoMark } from "@/components/site/logo";

export const metadata: Metadata = { title: "Page introuvable · SOGER", robots: { index: false } };

/** 404 des adresses qui ne correspondent à aucune page (site, gestion, documents). */
export default function GlobalNotFound() {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <main className="grid flex-1 place-items-center bg-ink px-4 py-24 text-center text-white">
          <div>
            <LogoMark className="mx-auto size-14 text-white" />
            <p className="mt-8 font-display text-6xl font-bold">404</p>
            <h1 className="mt-3 text-xl font-semibold">Page introuvable · Page not found · الصفحة غير موجودة</h1>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="/fr" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium hover:bg-accent-hover">Accueil</a>
              <a href="/en" className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium hover:bg-white/10">Home</a>
              <a href="/ar" className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium hover:bg-white/10" lang="ar">الرئيسية</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
