"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Graphiques légers sans bibliothèque : une seule série (vert SOGER, contraste validé),
 * barres ≤ 24 px aux extrémités arrondies, grille fine, info-bulle au survol,
 * et tableau de données accessible (« Voir les données »).
 */
type Point = { label: string; value: number; hint?: string };

const nf = new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 });
const defaultFormat = (n: number) => `${nf.format(n)} DT`;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function DataTable({ data, format, label }: { data: Point[]; format: (n: number) => string; label: string }) {
  return (
    <details className="mt-3 text-xs text-steel">
      <summary className="cursor-pointer select-none hover:text-ink">Voir les données</summary>
      <table className="mt-2 w-full">
        <thead><tr><th className="py-1 text-left font-medium">{label}</th><th className="py-1 text-right font-medium">Valeur</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label} className="border-t border-line"><td className="py-1">{d.label}</td><td className="py-1 text-right tabular-nums">{format(d.value)}</td></tr>)}</tbody>
      </table>
    </details>
  );
}

/** Colonnes verticales (ex. chiffre d'affaires mensuel). */
export function ColumnChart({ data, format = defaultFormat, height = 200, axisLabel = "Période" }: { data: Point[]; format?: (n: number) => string; height?: number; axisLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.5, 1].map((r) => r * max);
  return (
    <div>
      <div className="relative flex gap-2" style={{ height }}>
        <div className="flex w-14 shrink-0 flex-col justify-between py-0 text-right text-[11px] text-steel tabular-nums">
          {[...ticks].reverse().map((t) => <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{nf.format(t)}</span>)}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / max) * 100}%` }} />)}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {data.map((d, i) => (
              <div
                key={d.label}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={cn("w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity", hover !== null && hover !== i && "opacity-40")}
                  style={{ height: `${(Math.max(0, d.value) / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lift">
                    <p className="text-white/60">{d.label}</p>
                    <p className="font-semibold tabular-nums">{format(d.value)}</p>
                    {d.hint && <p className="text-white/60">{d.hint}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-0.5 pl-16 text-[11px] text-steel">
        {data.map((d, i) => (
          <span key={d.label} className="flex-1 truncate text-center">{data.length > 14 && i % Math.ceil(data.length / 7) !== 0 ? "" : d.label}</span>
        ))}
      </div>
      <DataTable data={data} format={format} label={axisLabel} />
    </div>
  );
}

/** Courbe + aire (ex. ventes quotidiennes), réticule et info-bulle au survol. */
export function AreaChart({ data, format = defaultFormat, height = 180, axisLabel = "Jour" }: { data: Point[]; format?: (n: number) => string; height?: number; axisLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 100;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const x = (i: number) => (data.length <= 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H} L${x(0)},${H} Z`;
  const last = data.length - 1;
  return (
    <div>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {[0, 0.5, 1].map((r) => <line key={r} x1={0} x2={W} y1={H - r * H} y2={H - r * H} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="var(--color-accent)" fillOpacity={0.1} />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--color-steel)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* Points HTML (non déformés par l'échelle du SVG) */}
        {data.length > 0 && (
          <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-white" style={{ left: `${(x(hover ?? last) / W) * 100}%`, top: `${(y(data[hover ?? last].value) / H) * 100}%` }} />
        )}
        <div className="absolute inset-0 flex">
          {data.map((d, i) => <div key={d.label} className="h-full flex-1" onMouseEnter={() => setHover(i)} />)}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lift"
            style={{ left: `${Math.min(90, Math.max(10, (x(hover) / W) * 100))}%` }}
          >
            <p className="text-white/60">{data[hover].label}</p>
            <p className="font-semibold tabular-nums">{format(data[hover].value)}</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-steel">
        <span>{data[0]?.label}</span>
        <span>Max {format(Math.max(0, ...data.map((d) => d.value)))}</span>
        <span>{data[last]?.label}</span>
      </div>
      <DataTable data={data} format={format} label={axisLabel} />
    </div>
  );
}

/** Classement en barres horizontales (top produits, ventes par catégorie). */
export function RankBars({ data, format = defaultFormat }: { data: Point[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-6 text-center text-sm text-steel">Pas encore de données sur la période.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="group">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-graphite">{d.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{format(d.value)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-mist">
            <div className="h-2 rounded-full bg-accent transition-opacity group-hover:opacity-80" style={{ width: `${(Math.max(0, d.value) / max) * 100}%` }} title={d.hint} />
          </div>
          {d.hint && <p className="mt-1 text-xs text-steel">{d.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
