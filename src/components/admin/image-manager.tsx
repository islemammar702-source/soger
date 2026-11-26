"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Loader2, RefreshCw, Star, Trash2, Upload, X } from "lucide-react";
import { deleteProductImageAction, saveProductImagesAction, uploadProductImageAction } from "@/server/admin/products";
import { cn, isOptimizable } from "@/lib/utils";

export type ManagedImage = { id: number; url: string; alt: string | null; isPrimary: boolean };

export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
export const MAX_MB = 8;

/** Contrôle côté navigateur (le serveur revérifie le contenu réel du fichier). */
export function checkFile(f: File) {
  if (!ACCEPTED.includes(f.type)) return `« ${f.name} » : format non accepté (JPEG, PNG ou WebP).`;
  if (f.size > MAX_MB * 1024 * 1024) return `« ${f.name} » : ${(f.size / 1024 / 1024).toFixed(1)} Mo, ${MAX_MB} Mo maximum.`;
  return null;
}

export async function uploadOne(productId: number, file: File, opts: { replaceId?: number; alt?: string } = {}) {
  const fd = new FormData();
  fd.set("productId", String(productId));
  fd.set("file", file);
  if (opts.replaceId) fd.set("replaceId", String(opts.replaceId));
  if (opts.alt) fd.set("alt", opts.alt);
  try {
    return await uploadProductImageAction(fd);
  } catch {
    return { ok: false as const, message: `« ${file.name} » : envoi interrompu (fichier trop lourd ou connexion perdue).` };
  }
}

type Pending = { key: string; file: File; preview: string; state: "waiting" | "sending" | "error"; message?: string };

/** Sélection de fichiers avec aperçu (glisser-déposer ou parcourir). */
export function FileDrop({ onFiles, disabled, compact }: { onFiles: (f: File[]) => void; disabled?: boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}
      className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-mist/40 text-center transition", compact ? "p-4" : "p-6", over && "border-accent bg-accent-soft/40")}
    >
      <ImagePlus className="size-6 text-steel" />
      <p className="text-sm">Glissez vos photos ici ou{" "}
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="font-medium text-accent hover:underline">parcourez</button>
      </p>
      <p className="text-xs text-steel">JPEG, PNG ou WebP · {MAX_MB} Mo max par photo · plusieurs fichiers possibles · converties en WebP</p>
      <input ref={input} type="file" multiple accept={ACCEPTED.join(",")} className="sr-only" aria-label="Choisir des photos" data-testid="image-input"
        onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}

/** Gestionnaire d'images d'une fiche produit existante. */
export function ImageManager({ productId, images, canEdit, storage }: { productId: number; images: ManagedImage[]; canEdit: boolean; storage: "cloudinary" | "database" }) {
  const router = useRouter();
  const [items, setItems] = useState(images);
  const [pending, setPending] = useState<Pending[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<number | null>(null);
  const sig = images.map((i) => `${i.id}:${i.url}:${i.isPrimary}:${i.alt}`).join("|");

  // Resynchroniser après router.refresh().
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setItems(images), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (next: ManagedImage[], alts?: Record<string, string>) => {
    setItems(next);
    start(async () => {
      const r = await saveProductImagesAction({ productId, order: next.map((i) => i.id), primaryId: next.find((i) => i.isPrimary)?.id ?? null, alts });
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    persist(next);
  };
  const makePrimary = (id: number) => persist(items.map((i) => ({ ...i, isPrimary: i.id === id })));
  const remove = (id: number) => {
    if (!confirm("Supprimer cette image ?")) return;
    start(async () => {
      const r = await deleteProductImageAction(id);
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  };

  const addFiles = (files: File[]) => {
    const errors: string[] = [];
    const ok: Pending[] = [];
    for (const f of files) {
      const e = checkFile(f);
      if (e) errors.push(e);
      else ok.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, preview: URL.createObjectURL(f), state: "waiting" });
    }
    if (errors.length) setMsg({ ok: false, text: errors.join(" ") });
    else setMsg(null);
    setPending((p) => [...p, ...ok]);
  };

  const sendAll = async () => {
    setUploading(true);
    let okCount = 0;
    const errors: string[] = [];
    for (const p of pending.filter((x) => x.state === "waiting")) {
      setPending((list) => list.map((x) => (x.key === p.key ? { ...x, state: "sending" } : x)));
      const r = await uploadOne(productId, p.file);
      if (r.ok) {
        okCount++;
        URL.revokeObjectURL(p.preview);
        setPending((list) => list.filter((x) => x.key !== p.key));
      } else {
        errors.push(r.message);
        setPending((list) => list.map((x) => (x.key === p.key ? { ...x, state: "error", message: r.message } : x)));
      }
    }
    setUploading(false);
    setMsg(errors.length ? { ok: false, text: `${okCount} image(s) ajoutée(s). ${errors.join(" ")}` } : { ok: true, text: `${okCount} image(s) ajoutée(s).` });
    router.refresh();
  };

  const onReplace = async (f: File | undefined) => {
    const id = replacing.current;
    replacing.current = null;
    if (!f || !id) return;
    const e = checkFile(f);
    if (e) return setMsg({ ok: false, text: e });
    setUploading(true);
    const r = await uploadOne(productId, f, { replaceId: id });
    setUploading(false);
    setMsg({ ok: r.ok, text: r.message });
    router.refresh();
  };

  const addUrl = () => {
    const fd = new FormData();
    fd.set("productId", String(productId));
    fd.set("url", url);
    start(async () => {
      const r = await uploadProductImageAction(fd);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setUrl("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4" id="images">
      {items.length === 0 && pending.length === 0 && <p className="text-sm text-steel">Aucune image : la fiche affiche l&apos;icône de la catégorie.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Images du produit">
        {items.map((img, i) => (
          <li
            key={img.id}
            draggable={canEdit && !busy}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
            className={cn("group overflow-hidden rounded-xl border bg-white", img.isPrimary ? "border-accent ring-2 ring-accent/20" : "border-line", drag === i && "opacity-50")}
            data-testid="image-card"
          >
            <div className="relative aspect-square bg-mist">
              <Image src={img.url} alt={img.alt ?? ""} fill sizes="200px" className="object-contain p-2" unoptimized={!isOptimizable(img.url)} />
              <span className="absolute top-1.5 left-1.5 rounded bg-ink/80 px-1.5 text-[10px] font-medium text-white">{i + 1}</span>
              {img.isPrimary && <span className="absolute top-1.5 right-1.5 rounded bg-accent px-1.5 text-[10px] font-semibold text-white">Principale</span>}
            </div>
            {canEdit && (
              <div className="space-y-1.5 border-t border-line p-2">
                <input
                  defaultValue={img.alt ?? ""}
                  key={img.alt ?? ""}
                  placeholder="Texte alternatif"
                  aria-label="Texte alternatif"
                  maxLength={200}
                  onBlur={(e) => { if (e.target.value !== (img.alt ?? "")) persist(items, { [img.id]: e.target.value }); }}
                  className="h-8 w-full rounded-md border border-line px-2 text-xs outline-none focus:border-accent"
                />
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <IconBtn label="Déplacer avant" onClick={() => move(i, i - 1)} disabled={busy || i === 0}><ArrowLeft /></IconBtn>
                    <IconBtn label="Déplacer après" onClick={() => move(i, i + 1)} disabled={busy || i === items.length - 1}><ArrowRight /></IconBtn>
                  </div>
                  <div className="flex gap-1">
                    {!img.isPrimary && <IconBtn label="Définir comme image principale" onClick={() => makePrimary(img.id)} disabled={busy}><Star /></IconBtn>}
                    <IconBtn label="Remplacer l'image" onClick={() => { replacing.current = img.id; replaceInput.current?.click(); }} disabled={busy || uploading}><RefreshCw /></IconBtn>
                    <IconBtn label="Supprimer l'image" onClick={() => remove(img.id)} disabled={busy} danger><Trash2 /></IconBtn>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key} className={cn("overflow-hidden rounded-xl border border-dashed bg-white", p.state === "error" ? "border-danger" : "border-accent/60")}>
            <div className="relative aspect-square bg-mist">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="size-full object-contain p-2" />
              {p.state === "sending" && <span className="absolute inset-0 grid place-items-center bg-white/60"><Loader2 className="size-6 animate-spin text-accent" /></span>}
              {!uploading && (
                <button type="button" aria-label="Retirer" onClick={() => { URL.revokeObjectURL(p.preview); setPending((l) => l.filter((x) => x.key !== p.key)); }} className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded bg-white/90 text-danger"><X className="size-3.5" /></button>
              )}
            </div>
            <p className={cn("truncate border-t border-line p-2 text-xs", p.state === "error" ? "text-danger" : "text-steel")} title={p.message ?? p.file.name}>
              {p.state === "error" ? p.message : p.state === "sending" ? "Envoi…" : `${p.file.name} · ${(p.file.size / 1024).toFixed(0)} Ko`}
            </p>
          </li>
        ))}
      </ul>

      {canEdit && (
        <>
          <FileDrop onFiles={addFiles} disabled={uploading} />
          {pending.some((p) => p.state === "waiting") && (
            <button type="button" onClick={sendAll} disabled={uploading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-graphite disabled:opacity-60">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Envoyer {pending.filter((p) => p.state === "waiting").length} photo(s)
            </button>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="… ou adresse https:// d'une image" aria-label="Adresse d'une image" className="h-10 w-full rounded-lg border border-line pr-3 pl-9 text-sm outline-none focus:border-accent" />
            </div>
            <button type="button" onClick={addUrl} disabled={busy || !url.trim()} className="h-10 rounded-lg border border-line px-3 text-sm font-medium hover:bg-mist disabled:opacity-50">Ajouter</button>
          </div>
          <input ref={replaceInput} type="file" accept={ACCEPTED.join(",")} className="sr-only" aria-label="Fichier de remplacement" data-testid="replace-input" onChange={(e) => { onReplace(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="text-xs text-steel">
            Glissez les vignettes pour changer l&apos;ordre. Stockage : {storage === "cloudinary" ? "Cloudinary (WebP/AVIF automatique)" : "base de données SOGER (optimisées en WebP, 1600 px max)"}.
          </p>
        </>
      )}
      {(busy || uploading) && <p className="flex items-center gap-2 text-xs text-steel"><Loader2 className="size-3.5 animate-spin" /> Enregistrement…</p>}
      {msg && <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-accent-soft text-accent-hover" : "bg-red-50 text-danger")}>{msg.text}</p>}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("grid size-7 place-items-center rounded-md border border-line text-graphite hover:bg-mist disabled:opacity-40 [&_svg]:size-3.5", danger && "text-danger hover:bg-red-50")}>
      {children}
    </button>
  );
}
