"use client";

import { useState } from "react";
import { stockOperationAction } from "@/server/admin/stock";
import type { FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, Select, SubmitButton, useFormAction } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const OPS = [
  ["in", "Entrée", "Ajout de stock (hors réception fournisseur)"],
  ["out", "Sortie", "Casse, usage interne, perte…"],
  ["set", "Ajustement", "Fixer la quantité physique comptée"],
  ["transfer", "Transfert", "D'un dépôt vers un autre"],
  ["supplier_return", "Retour fournisseur", "Renvoi d'articles au fournisseur"],
] as const;

export function StockOperationForm({ warehouses, defaultSku, canTransfer }: { warehouses: { id: number; name: string }[]; defaultSku?: string; canTransfer: boolean }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(stockOperationAction, { status: "idle" });
  const [op, setOp] = useState<(typeof OPS)[number][0]>("in");
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-line bg-white p-5">
      <div className="grid gap-2 sm:grid-cols-5">
        {OPS.filter(([v]) => v !== "transfer" || canTransfer).map(([v, title, text]) => (
          <label key={v} className={cn("cursor-pointer rounded-lg border p-3 text-sm transition", op === v ? "border-accent bg-accent-soft/40 ring-2 ring-accent/20" : "border-line hover:border-ink/30")}>
            <input type="radio" name="op" value={v} checked={op === v} onChange={() => setOp(v)} className="sr-only" />
            <span className="block font-semibold">{title}</span>
            <span className="block text-xs text-steel">{text}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Référence SOGER (ou scan)" error={err("sku")}><Input name="sku" defaultValue={defaultSku} autoFocus className="font-mono uppercase" invalid={!!err("sku")} /></Field>
        <Field label={op === "transfer" ? "Dépôt d'origine" : "Dépôt"}>
          <Select name="warehouseId">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        </Field>
        {op === "transfer" && (
          <Field label="Dépôt de destination" error={err("toWarehouseId")}>
            <Select name="toWarehouseId" defaultValue={warehouses[1]?.id}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
          </Field>
        )}
        <Field label={op === "set" ? "Quantité comptée" : "Quantité"} error={err("quantity")}><Input name="quantity" inputMode="decimal" invalid={!!err("quantity")} /></Field>
        {(op === "in" || op === "set") && <Field label="Coût unitaire HT" optional hint="Par défaut : prix d'achat de la fiche"><Input name="unitCost" inputMode="decimal" /></Field>}
        <Field label="Motif" error={err("note")} className="sm:col-span-2"><Input name="note" placeholder="ex. casse en magasin, régularisation…" invalid={!!err("note")} /></Field>
      </div>
      {warehouses.length < 2 && op === "transfer" && <p className="text-sm text-amber-700">Créez un second dépôt pour effectuer des transferts.</p>}
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="dark">Enregistrer le mouvement</SubmitButton>
    </form>
  );
}
