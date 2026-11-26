"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/** Bouton d'impression (« Enregistrer au format PDF » dans la fenêtre d'impression). Masqué à l'impression. */
export function PrintButton({ auto = false }: { auto?: boolean }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [auto]);
  return (
    <div className="fixed right-4 bottom-4 flex gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white shadow-lift">
        <Printer className="size-4" /> Imprimer / PDF
      </button>
    </div>
  );
}
