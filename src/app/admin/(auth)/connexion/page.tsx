import type { Metadata } from "next";
import { LogoMark } from "@/components/site/logo";
import { LoginForm } from "@/components/site/auth-forms";

export const metadata: Metadata = { title: "Connexion · Gestion SOGER", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <main className="bg-blueprint grid min-h-screen place-items-center bg-ink px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-white">
          <LogoMark className="size-12" />
          <p className="mt-4 font-display text-2xl font-bold">SOGER Gestion</p>
          <p className="text-sm text-white/55">Espace réservé au personnel</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-lift">
          <LoginForm area="staff" />
        </div>
      </div>
    </main>
  );
}
