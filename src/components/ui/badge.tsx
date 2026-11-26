import { cn } from "@/lib/utils";

export function Badge({ tone, children, className }: { tone?: string; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tone ?? "bg-steel/10 text-graphite", className)}>{children}</span>;
}
