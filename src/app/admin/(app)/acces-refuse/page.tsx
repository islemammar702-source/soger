import Link from "next/link";
import { ShieldX } from "lucide-react";
import { requireStaff } from "@/server/auth/dal";

async function Denied({ searchParams }: { searchParams: PageProps<"/admin/acces-refuse">["searchParams"] }) {
  await requireStaff();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <ShieldX className="mx-auto size-12 text-danger" />
      <h1 className="mt-4 font-display text-2xl font-bold">Accès refusé</h1>
      <p className="mt-2 text-sm text-steel">Votre rôle ne permet pas d&apos;accéder à cette page{typeof sp.p === "string" ? ` (permission « ${sp.p} »)` : ""}. Contactez un administrateur si nécessaire.</p>
      <Link href="/admin" className="mt-6 inline-block rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white">Retour au tableau de bord</Link>
    </div>
  );
}

export default function DeniedPage({ searchParams }: PageProps<"/admin/acces-refuse">) {
  return <Denied searchParams={searchParams} />;
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
