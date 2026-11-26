import Link from "next/link";
import { cn } from "@/lib/utils";

/** Emblème SOGER : bague de roulement stylisée, 8 billes. */
export function LogoMark({ className }: { className?: string }) {
  const balls = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { cx: 20 + Math.cos(a) * 12.5, cy: 20 + Math.sin(a) * 12.5 };
  });
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-9", className)}>
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3.2" />
      <circle cx="20" cy="20" r="7" fill="none" stroke="currentColor" strokeWidth="3.2" />
      {balls.map((b, i) => (
        <circle key={i} {...b} r="2.4" className="fill-accent" />
      ))}
    </svg>
  );
}

export function Logo({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Link
      href="/"
      aria-label="SOGER – accueil"
      className={cn(
        "flex items-center gap-2.5",
        tone === "dark" ? "text-ink" : "text-white",
        className,
      )}
    >
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-bold tracking-tight">SOGER</span>
        <span
          className={cn(
            "mt-0.5 hidden text-[10px] font-medium tracking-[0.12em] uppercase sm:block",
            tone === "dark" ? "text-steel" : "text-white/55",
          )}
        >
          Société Générale de Roulement
        </span>
      </span>
    </Link>
  );
}
