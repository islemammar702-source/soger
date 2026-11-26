import { Download } from "lucide-react";
import { ImportWizard } from "@/components/admin/import-wizard";
import { Card, PageHeader, btn } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";

export default async function ImportPage() {
  const me = await requireStaff("products.import");
  return (
    <>
      <PageHeader
        title="Import / export"
        description="Importez des milliers de références, mettez à jour les prix et les stocks."
        actions={
          me.can("products.export") && (
            <>
              <a href="/admin/export/produits?modele=1" className={btn.outline}><Download className="size-4" /> Modèle Excel</a>
              <a href="/admin/export/produits?format=xlsx" className={btn.outline}><Download className="size-4" /> Exporter (Excel)</a>
              <a href="/admin/export/produits?format=csv" className={btn.outline}><Download className="size-4" /> Exporter (CSV)</a>
            </>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <ImportWizard canPublish={me.can("products.publish")} />
        <Card title="Conseils">
          <ul className="space-y-3 text-sm text-graphite">
            <li>Partez du <strong>modèle Excel</strong> ou d&apos;un export : les colonnes sont reconnues automatiquement.</li>
            <li>La <strong>référence SOGER</strong> identifie le produit : une référence existante est mise à jour, une nouvelle est créée.</li>
            <li>Les cellules vides ne modifient pas la valeur existante.</li>
            <li>Prix en dinars HT, avec virgule ou point (ex. 12,500).</li>
            <li>Le traitement se fait par lots de 250 lignes : une erreur ne bloque que son lot, et le rapport liste chaque ligne refusée.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
