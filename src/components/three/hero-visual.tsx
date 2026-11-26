"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { SceneQuality } from "./bearing-scene";

// Three.js n'est téléchargé que si l'appareil peut l'afficher.
const BearingScene = dynamic(() => import("./bearing-scene"), { ssr: false });

type Mode = "static" | SceneQuality;

function detectMode(): Mode {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return "static";
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "static";
  } catch {
    return "static";
  }
  const lowPower = (nav.deviceMemory ?? 8) < 4 || (nav.hardwareConcurrency ?? 8) <= 4;
  const small = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
  return lowPower || small ? "lite" : "full";
}

export function HeroVisual({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    // Attend que le navigateur soit libre : la 3D ne retarde pas l'affichage du texte.
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = ric(() => setMode(detectMode()));
    return () => cancel(id);
  }, []);

  const live = mode === "full" || mode === "lite";

  return (
    <div className={cn("relative", className)}>
      <BearingPoster className={cn("absolute inset-0 m-auto transition-opacity duration-1000", live ? "opacity-0" : "opacity-100")} />
      {live && <BearingScene quality={mode} />}
    </div>
  );
}

/** Illustration vectorielle : repli sans WebGL / mouvement réduit, et pendant le chargement. */
export function BearingPoster({ className }: { className?: string }) {
  const balls = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2;
    return { cx: 200 + Math.cos(a) * 112, cy: 200 + Math.sin(a) * 112 * 0.55 };
  });
  return (
    <svg viewBox="0 0 400 400" aria-hidden className={cn("h-full w-full max-w-[520px]", className)}>
      <defs>
        <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.45" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <radialGradient id="ball" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#475569" />
        </radialGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#16a34a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="200" cy="215" rx="190" ry="120" fill="url(#glow)" />
      <g>
        <ellipse cx="200" cy="200" rx="170" ry="94" fill="none" stroke="url(#steel)" strokeWidth="38" />
        <ellipse cx="200" cy="200" rx="78" ry="43" fill="none" stroke="url(#steel)" strokeWidth="30" />
        {balls.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r="17" fill="url(#ball)" />
        ))}
      </g>
    </svg>
  );
}
