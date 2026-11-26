"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { IMPORT_FIELDS } from "@/lib/import-fields";
import { previewImportAction, runImportAction, type ImportReport, type PreviewState } from "@/server/admin/import";

export function ImportWizard({ canPublish }: { canPublish: boolean }) {
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ImportReport>({ status: "idle" });
  const [pending, start] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    fileRef.current = file;
    setFileName(file.name);
    setReport({ status: "idle" });
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await previewImportAction({ status: "idle" }, fd);
      setPreview(res);
      if (res.status === "ready") setMapping(res.mapping);
    });
  };

  const run = (form: HTMLFormElement) => {
    if (!fileRef.current) return;
    const fd = new FormData(form);
    fd.set("file", fileRef.current);
    fd.set("mapping", JSON.stringify(mapping));
    start(async () => setReport(await runImportAction({ status: "idle" }, fd)));
  };

  const mappedSku = Object.values(mapping).includes("sku");

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold">1. Fichier</h2>
        <p className="mb-4 text-sm text-steel">Excel (.xlsx) ou CSV (séparateur « ; » ou « , », encodage UTF-8). La première ligne doit contenir les noms de colonnes.</p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-mist/40 px-6 py-10 text-center transition hover:border-accent hover:bg-accent-soft/20">
          {pending && preview.status !== "ready" ? <Loader2 className="size-8 animate-spin text-accent" /> : <Upload className="size-8 text-steel" />}
          <span className="text-sm font-medium">{fileName || "Cliquez pour choisir un fichier"}</span>
          <span className="text-xs text-steel">15 Mo et 20 000 lignes maximum</span>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {preview.status === "error" && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{preview.message}</p>}
      </section>

      {preview.status === "ready" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(e.currentTarget);
          }}
          className="space-y-6"
        >
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold">2. Correspondance des colonnes</h2>
            <p className="mb-4 text-sm text-steel">{preview.total} ligne(s) détectée(s). Les correspondances ont été proposées d&apos;après les en-têtes : vérifiez-les.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="border-b border-line p-2 text-left align-bottom">
                        <p className="mb-1.5 truncate text-xs font-semibold text-steel">{h}</p>
                        <select
                          value={mapping[h] ?? ""}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                          className={`h-9 w-full rounded-md border px-2 text-xs ${mapping[h] ? "border-accent bg-accent-soft/30" : "border-line"}`}
                        >
                          <option value="">— Ignorer —</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f.key} value={f.key} disabled={Object.entries(mapping).some(([k, v]) => v === f.key && k !== h)}>
                              {f.label}{"required" in f && f.required ? " *" : ""}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={i} className="text-xs">
                      {preview.headers.map((h, j) => <td key={h} className="max-w-48 truncate border-b border-line p-2 text-graphite">{r[j]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!mappedSku && <p className="mt-3 flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="size-4" /> Associez une colonne à « Référence SOGER » (obligatoire).</p>}
          </section>

          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold">3. Options</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <fieldset className="space-y-2 text-sm">
                <legend className="mb-1 text-xs font-semibold tracking-wide text-steel uppercase">Mode</legend>
                <label className="flex items-center gap-2"><input type="radio" name="mode" value="upsert" defaultChecked /> Créer les nouveaux et mettre à jour les existants</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" value="update" /> Mettre à jour seulement (prix, stock…)</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" value="create" /> Créer seulement (ignorer les références existantes)</label>
              </fieldset>
              <div className="space-y-2 text-sm">
                <p className="mb-1 text-xs font-semibold tracking-wide text-steel uppercase">Options</p>
                <label className="flex items-center gap-2"><input type="checkbox" name="createRefs" /> Créer les marques et catégories manquantes</label>
                {canPublish && <label className="flex items-center gap-2"><input type="checkbox" name="publish" /> Publier directement les nouveaux produits</label>}
                <p className="text-xs text-steel">La colonne « Stock » fixe la quantité physique du dépôt principal : l&apos;écart est enregistré comme mouvement d&apos;inventaire tracé.</p>
              </div>
            </div>
            <button type="submit" disabled={!mappedSku || pending} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Lancer l&apos;import ({preview.total} lignes)
            </button>
          </section>
        </form>
      )}

      {report.status !== "idle" && (
        <section className="rounded-xl border border-line bg-white p-5" aria-live="polite">
          <h2 className="mb-4 text-sm font-semibold">Rapport d&apos;import</h2>
          {report.status === "error" ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{report.message}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                {[["Créés", report.created], ["Mis à jour", report.updated], ["Mouvements de stock", report.stockMoves], ["Lignes ignorées", report.skipped]].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-mist/70 p-3"><p className="text-xs text-steel">{l}</p><p className="font-display text-2xl font-bold">{v}</p></div>
                ))}
              </div>
              {report.errors && report.errors.length > 0 ? (
                <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-mist"><tr><th className="p-2 text-left text-xs">Ligne</th><th className="p-2 text-left text-xs">Référence</th><th className="p-2 text-left text-xs">Problème</th></tr></thead>
                    <tbody>{report.errors.map((e, i) => <tr key={i} className="border-t border-line"><td className="p-2 tabular-nums">{e.line}</td><td className="p-2 font-mono text-xs">{e.sku}</td><td className="p-2 text-danger">{e.message}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-accent-hover"><CheckCircle2 className="size-4" /> Import terminé sans erreur.</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
