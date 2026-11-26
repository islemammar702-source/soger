import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { PosTerminal } from "@/components/admin/pos-terminal";
import { PageHeader, one } from "@/components/admin/ui";
import { getOpenSession } from "@/server/admin/caisse-queries";
import { requireStaff } from "@/server/auth/dal";

export default async function NewSalePage({ searchParams }: PageProps<"/admin/caisse/nouvelle-vente">) {
  const me = await requireStaff("pos.use");
  const open = await getOpenSession();
  if (!open) redirect(`/admin/caisse?erreur=${encodeURIComponent("Ouvrez la caisse avant d'enregistrer une vente.")}`);
  const cid = Number(one((await searchParams).client)) || null;
  const [c] = cid ? await db.select().from(customers).where(eq(customers.id, cid)) : [];
  return (
    <>
      <PageHeader
        title="Nouvelle vente"
        description={`${open.register} · session n°${open.s.id}`}
        actions={<Link href="/admin/caisse" className="inline-flex items-center gap-1 text-sm text-steel hover:text-ink"><ArrowLeft className="size-4" /> Retour à la caisse</Link>}
      />
      <PosTerminal
        sessionId={open.s.id}
        canDiscount={me.can("pos.discount")}
        canCreateCustomer={me.can("customers.create")}
        initialCustomer={c ? { id: c.id, code: c.code, name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" "), phone: c.phone, pro: c.type === "professional" && c.priceTier === "professional" } : null}
      />
    </>
  );
}

/** Données en temps réel : la navigation attend le serveur, un écran de chargement s'affiche. */
export const instant = false;
