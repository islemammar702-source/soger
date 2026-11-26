import { desc, ilike, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { getCurrentUser } from "@/server/auth/dal";

/** Recherche client pour les éditeurs du back-office. Personnel uniquement. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return Response.json({ error: "Non autorisé" }, { status: 401 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ items: [] });
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // Téléphone : on compare les chiffres seuls (« 98123456 » trouve « +216 98 123 456 »).
  const digits = q.replace(/\D/g, "");
  const rows = await db
    .select({ id: customers.id, code: customers.code, companyName: customers.companyName, firstName: customers.firstName, lastName: customers.lastName, phone: customers.phone, email: customers.email, type: customers.type, priceTier: customers.priceTier })
    .from(customers)
    .where(or(ilike(customers.code, like), ilike(customers.companyName, like), ilike(customers.lastName, like), ilike(customers.firstName, like), ilike(customers.phone, like), ilike(customers.taxId, like), digits.length >= 3 ? sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') like ${`%${digits}%`}` : undefined))
    .orderBy(desc(customers.createdAt))
    .limit(10);
  return Response.json({
    items: rows.map((c) => ({ id: c.id, code: c.code, name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" "), phone: c.phone, email: c.email, pro: c.type === "professional" && c.priceTier === "professional" })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
