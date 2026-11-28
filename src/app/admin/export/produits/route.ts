import { asc, eq, sql } from "drizzle-orm";
import { qcol } from "@/db/qcol";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { brands, categories, products, stock } from "@/db/schema";
import { getCurrentUser, getUserAccess } from "@/server/auth/dal";
import { audit } from "@/server/audit";
import { toCsv, toXlsx } from "@/lib/spreadsheet";

/** Export du catalogue (CSV ou Excel). `?modele=1` : fichier modèle vide pour l'import. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return new Response("Non autorisé", { status: 401 });
  const access = await getUserAccess(user.id);
  if (!access.permissions.has("products.export")) return new Response("Permission requise : products.export", { status: 403 });
  const withCost = access.permissions.has("products.view_cost");
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const template = request.nextUrl.searchParams.get("modele") === "1";

  const headers = ["Référence SOGER", "Désignation", "Réf. fabricant", "Code-barres", "Marque", "Catégorie", "Unité", ...(withCost ? ["Prix d'achat HT"] : []), "Prix de vente HT", "Prix pro HT", "TVA (%)", "Stock (quantité physique)", "Stock minimum", "Description courte", "Statut (publié / brouillon)"];
  const rows = template
    ? [["SG-EXEMPLE-01", "Roulement à billes 6206-2RS", "6206-2RSH", "", "SKF", "Roulements", "pièce", ...(withCost ? [11.2] : []), 18.9, 15.9, 19, 50, 10, "Exemple — supprimez cette ligne", "brouillon"]]
    : (
        await db
          .select({
            sku: products.sku, name: products.name, mref: products.manufacturerRef, barcode: products.barcode, brand: brands.name, category: categories.name, unit: products.unit,
            purchase: products.purchasePrice, sale: products.salePrice, pro: products.proPrice, vat: products.vatRate,
            onHand: sql<string>`coalesce((select sum(s.quantity_on_hand) from ${stock} s where s.product_id = ${qcol(products.id)}), 0)`,
            min: products.minStock, short: products.shortDescription, status: products.status,
          })
          .from(products)
          .leftJoin(brands, eq(brands.id, products.brandId))
          .leftJoin(categories, eq(categories.id, products.categoryId))
          .orderBy(asc(products.sku))
      ).map((p) => [
        p.sku, p.name, p.mref, p.barcode, p.brand, p.category, p.unit,
        ...(withCost ? [p.purchase == null ? null : Number(p.purchase)] : []),
        p.sale == null ? null : Number(p.sale), p.pro == null ? null : Number(p.pro), Number(p.vat), Number(p.onHand), Number(p.min), p.short,
        p.status === "published" ? "publié" : p.status === "archived" ? "archivé" : "brouillon",
      ]);

  if (!template) await audit({ userId: user.id, module: "products", action: "export", entityType: "format", entityId: format, newValues: { rows: rows.length } });
  const date = new Date().toISOString().slice(0, 10);
  const name = template ? "modele-import-produits" : `produits-soger-${date}`;
  const headersOut = { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${name}.${format}"` };
  if (format === "csv") return new Response(toCsv(headers, rows), { headers: { ...headersOut, "Content-Type": "text/csv; charset=utf-8" } });
  return new Response(new Uint8Array(toXlsx(headers, rows, "Produits")), { headers: { ...headersOut, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}
