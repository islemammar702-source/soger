import { asc } from "drizzle-orm";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { Card, Flash, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { saveWarehouseAction, setDefaultWarehouseAction } from "@/server/admin/stock";
import { requireStaff } from "@/server/auth/dal";

const input = "h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm outline-none focus:border-accent";

export default async function WarehousesPage({ searchParams }: PageProps<"/admin/stock/depots">) {
  await requireStaff("settings.update");
  const sp = await searchParams;
  const rows = await db.select().from(warehouses).orderBy(asc(warehouses.name));
  const row = (w?: typeof warehouses.$inferSelect) => (
    <tr key={w?.id ?? "new"}>
      <Td colSpan={4} className="p-0">
        <form action={saveWarehouseAction} className="grid grid-cols-[100px_1fr_1.4fr_auto] items-center gap-2 px-4 py-2">
          {w && <input type="hidden" name="id" value={w.id} />}
          <input name="code" defaultValue={w?.code} placeholder="CODE" required className={input + " font-mono uppercase"} />
          <input name="name" defaultValue={w?.name} placeholder="Nom du dépôt" required className={input} />
          <input name="address" defaultValue={w?.address ?? ""} placeholder="Adresse" className={input} />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={w?.isActive ?? true} /> Actif</label>
            <button className="h-9 rounded-md bg-ink px-3 text-xs font-medium text-white">{w ? "Enregistrer" : "Ajouter"}</button>
            {w?.isDefault ? <Badge tone="bg-accent-soft text-accent-hover">Par défaut</Badge> : w && <button formAction={setDefaultWarehouseAction} className="h-9 rounded-md px-2 text-xs text-accent hover:bg-mist">Définir par défaut</button>}
          </div>
        </form>
      </Td>
    </tr>
  );
  return (
    <>
      <PageHeader title="Dépôts" description="Le dépôt par défaut reçoit les ventes en ligne et les imports." back={{ href: "/admin/stock", label: "Stock" }} />
      <Flash sp={sp} />
      <Card padded={false}>
        <Table minWidth={820}>
          <thead><tr><Th>Code</Th><Th>Nom</Th><Th>Adresse</Th><Th /></tr></thead>
          <tbody>{row()}{rows.map((w) => row(w))}</tbody>
        </Table>
      </Card>
    </>
  );
}
