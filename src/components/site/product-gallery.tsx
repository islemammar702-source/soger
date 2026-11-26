"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

type Img = { url: string; alt: string | null };
const noop = () => () => {};

/**
 * Galerie produit : miniatures, loupe au survol (ordinateur),
 * plein écran au clic avec navigation clavier / balayage.
 */
export function ProductGallery({ images, name, icon }: { images: Img[]; name: string; icon?: string | null }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const current = images[index];
  const go = (d: number) => setIndex((i) => (i + d + images.length) % images.length);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox, images.length]);

  if (!current) {
    return (
      <div className="grid aspect-square place-items-center rounded-[var(--radius-card)] border border-line bg-gradient-to-br from-mist to-white">
        <div className="flex flex-col items-center gap-3 text-steel/50">
          <CategoryIcon name={icon} className="size-28" />
          <span className="text-xs">Photo bientôt disponible</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setLightbox(true)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
        aria-label="Agrandir l'image"
        className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-[var(--radius-card)] border border-line bg-gradient-to-br from-mist to-white"
      >
        <Image
          src={current.url}
          alt={current.alt ?? name}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain p-8 transition-transform duration-200 ease-out"
          style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        />
        <span className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-lg bg-white/90 text-graphite shadow-soft opacity-0 transition group-hover:opacity-100">
          <Expand className="size-4" />
        </span>
      </button>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Image ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "relative size-20 shrink-0 overflow-hidden rounded-lg border bg-mist transition",
                i === index ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-ink/30",
              )}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-contain p-1.5" />
            </button>
          ))}
        </div>
      )}

      {mounted &&
        createPortal(
          <AnimatePresence>
            {lightbox && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={name}
                className="fixed inset-0 z-[70] flex flex-col bg-ink/95 backdrop-blur"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex items-center justify-between p-4 text-white">
                  <p className="truncate text-sm text-white/70">{name} — {index + 1} / {images.length}</p>
                  <button type="button" onClick={() => setLightbox(false)} aria-label="Fermer" className="grid size-10 place-items-center rounded-lg hover:bg-white/10">
                    <X className="size-5" />
                  </button>
                </div>
                <motion.div
                  className="relative flex-1"
                  drag={images.length > 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -80) go(1);
                    if (info.offset.x > 80) go(-1);
                  }}
                >
                  <Image src={current.url} alt={current.alt ?? name} fill sizes="100vw" className="object-contain p-4 sm:p-10" />
                </motion.div>
                {images.length > 1 && (
                  <>
                    <button type="button" onClick={() => go(-1)} aria-label="Image précédente" className="absolute top-1/2 left-3 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
                      <ChevronLeft className="size-6" />
                    </button>
                    <button type="button" onClick={() => go(1)} aria-label="Image suivante" className="absolute top-1/2 right-3 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
                      <ChevronRight className="size-6" />
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
