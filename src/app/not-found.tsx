import Link from "next/link";
import { LogoMark } from "@/components/site/logo";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center bg-ink px-4 py-24 text-center text-white">
      <div>
        <LogoMark className="mx-auto size-14 text-white" />
        <p className="mt-8 font-display text-6xl font-bold">404</p>
        <h1 className="mt-3 text-xl font-semibold">Page introuvable</h1>
        <p className="mt-2 text-white/60">Cette page n’existe pas ou n’est pas encore disponible.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium hover:bg-accent-hover">Retour à l’accueil</Link>
          <Link href="/produits" className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium hover:bg-white/10">Catalogue</Link>
        </div>
      </div>
    </main>
  );
}
