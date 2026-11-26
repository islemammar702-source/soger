import type { NextRequest } from "next/server";
import { getCurrentUser, getUserAccess } from "@/server/auth/dal";
import { getReport, parsePeriod } from "@/server/admin/reports";
import { audit } from "@/server/audit";
import { toCsv, toXlsx } from "@/lib/spreadsheet";
import { CHANNEL } from "@/lib/labels";

/** Export des rapports (CSV / Excel), permission reports.export. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return new Response("Non autorisé", { status: 401 });
  const access = await getUserAccess(user.id);
  if (!access.permissions.has("reports.export")) return new Response("Permission requise : reports.export", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const period = parsePeriod(sp.get("du") ?? undefined, sp.get("au") ?? undefined);
  const r = await getReport(period);
  const cost = access.permissions.has("products.view_cost");
  const type = sp.get("type") ?? "produits";
  const n = (v: number) => Math.round(v * 1000) / 1000;
  const tables: Record<string, [string[], (string | number)[][]]> = {
    ventes: [["Période", "Ventes TTC", "Détail"], r.timeline.map((t) => [t.label, n(t.value), t.hint ?? ""])],
    categories: [["Catégorie", "CA HT", ...(cost ? ["Marge"] : [])], r.byCategory.map((c) => [c.label, n(c.ht), ...(cost ? [n(c.margin)] : [])])],
    clients: [["Code", "Client", "Ventes", "CA TTC"], r.byCustomer.map((c) => [c.code, c.name, c.n, n(c.ttc)])],
    produits: [["Référence", "Désignation", "Quantité", "CA HT", ...(cost ? ["Marge"] : [])], r.byProduct.map((p) => [p.sku ?? "", p.name, p.qty, n(p.ht), ...(cost ? [n(p.margin)] : [])])],
    depenses: [["Catégorie", "Montant"], r.expenses.map((e) => [e.label, n(e.value)])],
    canaux: [["Canal", "Ventes", "CA TTC"], r.byChannel.map((c) => [CHANNEL[c.key], c.n, n(c.ttc)])],
  };
  const t = tables[type];
  if (!t) return new Response("Type de rapport inconnu", { status: 400 });
  await audit({ userId: user.id, module: "reports", action: "export", entityType: "report", entityId: type, newValues: { du: period.fromStr, au: period.toStr } });
  const name = `rapport-${type}-${period.fromStr}-${period.toStr}`;
  const csv = sp.get("format") === "csv";
  const headers = { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${name}.${csv ? "csv" : "xlsx"}"` };
  if (csv) return new Response(toCsv(t[0], t[1]), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  return new Response(new Uint8Array(toXlsx(t[0], t[1], type)), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}
