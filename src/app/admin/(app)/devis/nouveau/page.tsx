import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { QuoteEditor } from "@/components/admin/doc-editors";
import { PageHeader, one } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";

export default async function NewQuotePage({ searchParams }: PageProps<"/admin/devis/nouveau">) {
  await requireStaff("quotes.create");
  const cid = Number(one((await searchParams).client)) || null;
  const [c] = cid ? await db.select().from(customers).where(eq(customers.id, cid)) : [];
  return (
    <>
      <PageHeader title="Nouveau devis" back={{ href: "/admin/devis", label: "Devis" }} />
      <QuoteEditor initial={{ customer: c ? { id: c.id, code: c.code, name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" "), pro: c.type === "professional" && c.priceTier === "professional" } : null, contactName: "", contactPhone: "", contactEmail: "", companyName: "", validUntil: "", conditions: "", notes: "", lines: [] }} />
    </>
  );
}
