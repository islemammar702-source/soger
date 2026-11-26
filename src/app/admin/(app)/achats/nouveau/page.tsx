import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers, warehouses } from "@/db/schema";
import { PurchaseOrderEditor } from "@/components/admin/doc-editors";
import { PageHeader, one } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";

export default async function NewPurchasePage({ searchParams }: PageProps<"/admin/achats/nouveau">) {
  await requireStaff("purchases.create");
  const sp = await searchParams;
  const [sups, whs] = await Promise.all([
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)),
    db.select({ id: warehouses.id, name: warehouses.name, isDefault: warehouses.isDefault }).from(warehouses).where(eq(warehouses.isActive, true)),
  ]);
  const def = whs.find((w) => w.isDefault) ?? whs[0];
  return (
    <>
      <PageHeader title="Nouvelle commande fournisseur" back={{ href: "/admin/achats", label: "Achats" }} />
      {sups.length === 0 ? <p className="rounded-xl border border-line bg-white p-6 text-sm">Créez d&apos;abord un fournisseur.</p> : <PurchaseOrderEditor suppliers={sups} warehouses={whs} initial={{ supplierId: one(sp.fournisseur), warehouseId: String(def?.id ?? ""), expectedAt: "", notes: "", lines: [] }} />}
    </>
  );
}
