import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  hrefLabel = "Tout voir",
  tone = "dark",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  hrefLabel?: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-accent uppercase">
            <span className="h-px w-6 bg-accent" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h2 className={cn("text-3xl font-bold sm:text-4xl", tone === "dark" ? "text-ink" : "text-white")}>{title}</h2>
        {description && (
          <p className={cn("mt-3 text-base leading-relaxed", tone === "dark" ? "text-steel" : "text-white/60")}>{description}</p>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className={cn(
            "group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold",
            tone === "dark" ? "text-ink hover:text-accent" : "text-white hover:text-accent",
          )}
        >
          {hrefLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
