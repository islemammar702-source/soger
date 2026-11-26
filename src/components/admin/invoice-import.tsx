"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileUp, Loader2, ScanLine, Sparkles, Video, X } from "lucide-react";
import { extractInvoiceAction, uploadInvoiceFileAction, type InvoiceDraft } from "@/server/admin/supplier-invoices";
import { cn } from "@/lib/utils";
import { SupplierInvoiceForm } from "./supplier-invoice-form";

type Perms = { canPay: boolean; canStock: boolean; canCreateProduct: boolean; canCreateSupplier: boolean };
type Stage =
  | { name: "pick" }
  | { name: "reading"; step: string }
  | { name: "review"; fileId: number; mimeType: string; fileName: string; draft: InvoiceDraft; raw?: unknown; duplicate: string | null; notice: { ok: boolean; text: string } };

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_MB = 9;

/** Importer / scanner une facture : fichier ou photo → lecture automatique → formulaire prérempli à vérifier. */
export function InvoiceImport({ perms, aiEnabled, empty }: { perms: Perms; aiEnabled: boolean; empty: InvoiceDraft }) {
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [webcam, setWebcam] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return setError(`« ${file.name} » : format non accepté (PDF, JPG ou PNG).`);
    if (file.size > MAX_MB * 1024 * 1024) return setError(`« ${file.name} » : ${(file.size / 1024 / 1024).toFixed(1)} Mo, ${MAX_MB} Mo maximum.`);
    setStage({ name: "reading", step: "Envoi du fichier…" });
    const fd = new FormData();
    fd.set("file", file);
    let up;
    try {
      up = await uploadInvoiceFileAction(fd);
    } catch {
      up = { ok: false as const, message: "Envoi interrompu (fichier trop lourd ou connexion perdue)." };
    }
    if (!up.ok) {
      setStage({ name: "pick" });
      return setError(up.message);
    }
    if (!aiEnabled) {
      return setStage({ name: "review", fileId: up.fileId, mimeType: up.mimeType, fileName: up.name, draft: empty, duplicate: null, notice: { ok: false, text: "Reconnaissance automatique non configurée : complétez le formulaire en vous aidant de l'aperçu." } });
    }
    setStage({ name: "reading", step: "Lecture de la facture (fournisseur, lignes, totaux)… cela peut prendre jusqu'à une minute." });
    let r;
    try {
      r = await extractInvoiceAction(up.fileId);
    } catch {
      r = { ok: false as const, message: "Lecture automatique interrompue." };
    }
    if (r.ok) {
      setStage({ name: "review", fileId: up.fileId, mimeType: up.mimeType, fileName: up.name, draft: r.draft, raw: r.raw, duplicate: r.duplicate, notice: { ok: true, text: `Lecture terminée : ${r.draft.lines.length} ligne(s) reconnue(s). Vérifiez chaque information avant d'enregistrer.` } });
    } else {
      setStage({ name: "review", fileId: up.fileId, mimeType: up.mimeType, fileName: up.name, draft: empty, duplicate: null, notice: { ok: false, text: `${r.message} Le fichier est conservé : complétez le formulaire à partir de l'aperçu.` } });
    }
  };

  if (stage.name === "review") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 2xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0 space-y-4">
          <p role="status" className={cn("flex items-center gap-2 rounded-lg px-4 py-3 text-sm", stage.notice.ok ? "bg-accent-soft/60 text-accent-hover" : "bg-amber-50 text-amber-900")} data-testid="import-notice">
            <Sparkles className="size-4 shrink-0" /> {stage.notice.text}
          </p>
          <SupplierInvoiceForm draft={stage.draft} perms={perms} sourceFileId={stage.fileId} raw={stage.raw} duplicate={stage.duplicate} />
        </div>
        <aside className="2xl:sticky 2xl:top-20 2xl:self-start">
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-sm">
              <span className="truncate font-medium" title={stage.fileName}>Original : {stage.fileName}</span>
              <a href={`/media/${stage.fileId}`} target="_blank" className="shrink-0 text-xs font-medium text-accent">Ouvrir</a>
            </div>
            {stage.mimeType === "application/pdf" ? (
              <iframe src={`/media/${stage.fileId}#view=FitH`} title="Aperçu de la facture" className="h-[78vh] w-full bg-mist" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/media/${stage.fileId}`} alt="Facture importée" className="max-h-[78vh] w-full object-contain bg-mist" />
            )}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {!aiEnabled && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La reconnaissance automatique n&apos;est pas encore activée (clé <code className="font-mono">ANTHROPIC_API_KEY</code> absente). Vous pouvez quand même importer la facture : elle sera conservée et affichée à côté du formulaire pour une saisie rapide.
        </p>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (stage.name === "pick") handle(e.dataTransfer.files[0]); }}
        className={cn("flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-white px-6 py-12 text-center transition", over && "border-accent bg-accent-soft/30")}
      >
        {stage.name === "reading" ? (
          <>
            <Loader2 className="size-10 animate-spin text-accent" />
            <p className="font-medium" data-testid="reading">{stage.step}</p>
            <p className="text-xs text-steel">Aucune facture n&apos;est enregistrée à cette étape.</p>
          </>
        ) : (
          <>
            <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-hover"><ScanLine className="size-7" /></span>
            <div>
              <p className="text-lg font-semibold">Glissez la facture ici</p>
              <p className="text-sm text-steel">PDF, JPG ou PNG · {MAX_MB} Mo maximum</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-graphite"><FileUp className="size-4" /> Choisir un fichier</button>
              <button type="button" onClick={() => cameraInput.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-mist"><Camera className="size-4" /> Photographier (téléphone, tablette)</button>
              <button type="button" onClick={() => setWebcam(true)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-mist"><Video className="size-4" /> Webcam de l&apos;ordinateur</button>
            </div>
            <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only" aria-label="Fichier de facture" data-testid="invoice-file" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Photo de facture" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}
      <ol className="grid gap-3 text-sm sm:grid-cols-3">
        {["Importez le PDF ou une photo nette, à plat et bien éclairée.", "Les informations sont lues automatiquement et rapprochées de vos fournisseurs et produits.", "Vous vérifiez, corrigez et confirmez : rien n'est enregistré sans votre validation."].map((s, i) => (
          <li key={i} className="rounded-xl border border-line bg-white p-4"><span className="mb-1 block text-xs font-semibold text-accent">Étape {i + 1}</span>{s}</li>
        ))}
      </ol>
      {webcam && <WebcamCapture onClose={() => setWebcam(false)} onCapture={(f) => { setWebcam(false); handle(f); }} />}
    </div>
  );
}

/** Capture d'une photo avec la webcam de l'ordinateur (si le navigateur l'autorise). */
function WebcamCapture({ onClose, onCapture }: { onClose: () => void; onCapture: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(() => (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia ? "Ce navigateur ne permet pas d'utiliser la caméra. Importez un fichier à la place." : null));
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setErr("Caméra indisponible ou accès refusé. Autorisez la caméra dans le navigateur, ou importez un fichier."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(new File([b], `facture-${Date.now()}.jpg`, { type: "image/jpeg" })), "image/jpeg", 0.92);
  };
  return (
    <div role="dialog" aria-modal aria-label="Photographier la facture" className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><p className="font-semibold">Photographier la facture</p><button type="button" onClick={onClose} aria-label="Fermer"><X className="size-5" /></button></div>
        {err ? <p className="p-6 text-sm text-danger">{err}</p> : <video ref={video} autoPlay playsInline muted className="aspect-video w-full bg-ink object-contain" />}
        <div className="flex justify-end gap-2 border-t border-line p-3">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-line px-4 text-sm">Annuler</button>
          {!err && <button type="button" onClick={snap} className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white"><Camera className="size-4" /> Prendre la photo</button>}
        </div>
      </div>
    </div>
  );
}
