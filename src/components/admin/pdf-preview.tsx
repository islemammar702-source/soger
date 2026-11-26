"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Maximize2, Minus, Plus, X } from "lucide-react";

type Doc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; canvas?: HTMLCanvasElement }) => { promise: Promise<void> };
};

const MAX_PAGES = 10;

/**
 * Aperçu d'un PDF dessiné par le site (pdf.js) : toujours ajusté à la largeur disponible,
 * sans la barre latérale ni le zoom imposés par la visionneuse du navigateur.
 */
export function PdfPreview({ url, className }: { url: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const data = new Uint8Array(await res.arrayBuffer());
        const { getDocumentProxy } = await import("unpdf");
        const d = (await getDocumentProxy(data)) as unknown as Doc;
        if (alive) setDoc(d);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  if (error) {
    // Secours : visionneuse du navigateur.
    return <iframe src={`${url}#navpanes=0&view=FitH`} title="Aperçu de la facture" className={className} />;
  }

  const pages = doc ? Math.min(doc.numPages, MAX_PAGES) : 0;
  const toolbar = (
    <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-1.5 text-xs">
      <span className="text-steel">{doc ? `${doc.numPages} page(s)${doc.numPages > MAX_PAGES ? ` · ${MAX_PAGES} affichées` : ""}` : "Chargement…"}</span>
      <span className="flex items-center gap-1">
        <button type="button" aria-label="Réduire" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))} className="grid size-7 place-items-center rounded-md hover:bg-mist"><Minus className="size-3.5" /></button>
        <button type="button" onClick={() => setZoom(1)} className="min-w-12 rounded-md px-1.5 py-1 tabular-nums hover:bg-mist" title="Ajuster à la largeur">{Math.round(zoom * 100)} %</button>
        <button type="button" aria-label="Agrandir" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))} className="grid size-7 place-items-center rounded-md hover:bg-mist"><Plus className="size-3.5" /></button>
        <button type="button" aria-label={full ? "Fermer le plein écran" : "Plein écran"} onClick={() => setFull((f) => !f)} className="grid size-7 place-items-center rounded-md hover:bg-mist">{full ? <X className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>
      </span>
    </div>
  );
  const body = (
    <div ref={box} className="h-full overflow-auto bg-mist p-3" data-testid="pdf-preview">
      {!doc && <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-steel" /></div>}
      {doc && width > 0 && Array.from({ length: pages }, (_, i) => <PageCanvas key={`${i}-${width}-${zoom}`} doc={doc} n={i + 1} width={Math.max(200, (width - 2) * zoom)} />)}
    </div>
  );

  if (full) {
    return (
      <>
        <div className={className} />
        {/* Rendu dans <body> : au-dessus de l'en-tête et du menu du back-office. */}
        {createPortal(
          <div role="dialog" aria-modal aria-label="Facture en plein écran" className="fixed inset-0 z-[100] flex flex-col bg-ink/80 p-4" onKeyDown={(e) => e.key === "Escape" && setFull(false)}>
            <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white">{toolbar}<div className="min-h-0 flex-1">{body}</div></div>
          </div>,
          document.body,
        )}
      </>
    );
  }
  return <div className={`flex flex-col ${className ?? ""}`}>{toolbar}<div className="min-h-0 flex-1">{body}</div></div>;
}

function PageCanvas({ doc, n, width }: { doc: Doc; n: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const c = canvas.current;
      if (!c || cancelled) return;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      c.style.width = `${Math.floor(width)}px`;
      c.style.height = `${Math.floor(viewport.height / ratio)}px`;
      await page.render({ canvasContext: c.getContext("2d")!, viewport, canvas: c }).promise;
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [doc, n, width]);
  return <canvas ref={canvas} className="mx-auto mb-3 block bg-white shadow-sm" aria-label={`Page ${n}`} />;
}
