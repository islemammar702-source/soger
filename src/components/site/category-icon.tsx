import {
  Anchor, CircleDashed, CircleDot, Cog, Disc3, Droplet, Droplets, Gauge, HardHat,
  Link2, Nut, Package, RefreshCcw, Settings2, Shovel, Spline, Sprout, Tractor,
  Waves, Wrench, Zap, type LucideIcon,
} from "lucide-react";

/** Icônes autorisées pour les catégories (nom stocké en base). */
const ICONS: Record<string, LucideIcon> = {
  Anchor, CircleDashed, CircleDot, Cog, Disc3, Droplet, Droplets, Gauge, HardHat,
  Link2, Nut, RefreshCcw, Settings2, Shovel, Spline, Sprout, Tractor, Waves, Wrench, Zap,
};

export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Package;
  return <Icon className={className} strokeWidth={1.6} aria-hidden />;
}
