import { eq } from "drizzle-orm";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { StockOperationForm } from "@/components/admin/stock-op-form";
import { PageHeader, one } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";

export default async function StockOperationsPage({ searchParams }: PageProps<"/admin/stock/operations">) {
  const me = await requireStaff("stock.adjust");
  const sp = await searchParams;
  const whs = await db.select({ id: warehouses.id, name: warehouses.name, isDefault: warehouses.isDefault }).from(warehouses).where(eq(warehouses.isActive, true));
  whs.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return (
    <>
      <PageHeader
        title="Entrées, sorties et transferts"
        description="Chaque opération crée un mouvement tracé (date, utilisateur, motif). Les réceptions fournisseurs se font depuis les commandes fournisseurs, les ventes depuis les commandes et la caisse."
        back={{ href: "/admin/stock", label: "Stock" }}
      />
      <StockOperationForm warehouses={whs} defaultSku={one(sp.produit)} canTransfer={me.can("stock.transfer")} />
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
