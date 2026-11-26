"use client";

import { AnimatePresence, motion } from "motion/react";
import { Link, useI18n } from "@/i18n/client";
import { CheckCircle2, X } from "lucide-react";
import { useSyncExternalStore } from "react";

type Toast = { id: number; title: string; description?: string; action?: { href: string; label: string } };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Notification discrète (ajout au panier, confirmation…). */
export function toast(t: Omit<Toast, "id">) {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { ...t, id }];
  emit();
  window.setTimeout(() => dismiss(id), 4000);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Toast[] = [];

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  const tr = useI18n().t;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:end-4 sm:items-end">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-lift"
          >
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 truncate text-sm text-steel">{t.description}</p>}
              {t.action && (
                <Link href={t.action.href} onClick={() => dismiss(t.id)} className="mt-2 inline-block text-sm font-semibold text-accent hover:text-accent-hover">
                  {t.action.label} <span className="inline-block rtl:rotate-180">→</span>
                </Link>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label={tr.toast.close} className="text-steel hover:text-ink">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
