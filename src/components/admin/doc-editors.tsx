"use client";

import { useEffect, useState } from "react";
import { UserRound, X } from "lucide-react";
import { saveQuoteAction } from "@/server/admin/sales";
import { savePurchaseOrderAction } from "@/server/admin/purchases";
import type { FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useFormAction } from "@/components/ui/form";
import { LineEditor, type EditorLine } from "./line-editor";

export type CustomerRef = { id: number; code: string; name: string; phone?: string | null; email?: string | null; pro?: boolean };

export function CustomerPicker({ value, onChange }: { value: CustomerRef | null; onChange: (c: CustomerRef | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerRef[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/admin/api/clients?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (r.ok) setHits((await r.json()).items);
      } catch {}
    }, 150);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);
  if (value)
    return (
      <div className="flex h-11 items-center gap-2 rounded-lg border border-accent bg-accent-soft/30 px-3 text-sm">
        <UserRound className="size-4 text-accent" />
        <span className="min-w-0 flex-1 truncate"><strong>{value.name}</strong> <span className="font-mono text-xs text-steel">{value.code}</span>{value.pro && <span className="ml-2 rounded bg-ink px-1.5 text-[10px] text-white">PRO</span>}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Retirer le client" className="text-steel hover:text-danger"><X className="size-4" /></button>
      </div>
    );
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setHits([]); }} placeholder="Client : nom, code, téléphone, matricule…" aria-label="Rechercher un client" />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lift">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => { onChange(h); setQ(""); setHits([]); }} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-mist">
                <span><strong>{h.name}</strong> <span className="font-mono text-xs text-steel">{h.code}</span></span>
                <span className="text-xs text-steel">{h.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuoteEditor({ initial }: {
  initial: { id?: number; customer: CustomerRef | null; contactName: string; contactPhone: string; contactEmail: string; companyName: string; validUntil: string; conditions: string; notes: string; lines: EditorLine[] };
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveQuoteAction, { status: "idle" });
  const [customer, setCustomer] = useState<CustomerRef | null>(initial.customer);
  const [lines, setLines] = useState<EditorLine[]>(initial.lines);
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <section className="grid gap-4 rounded-xl border border-line bg-white p-5 md:grid-cols-2">
        <Field label="Client" hint="Les prix proposés tiennent compte des tarifs pros et négociés du client.">
          <CustomerPicker value={customer} onChange={setCustomer} />
        </Field>
        <Field label="Valable jusqu'au" optional hint="Par défaut : durée définie dans les paramètres, à l'envoi"><Input type="date" name="validUntil" defaultValue={initial.validUntil} /></Field>
        {!customer && (
          <>
            <Field label="Contact (prospect sans fiche)" optional><Input name="contactName" defaultValue={initial.contactName} /></Field>
            <Field label="Société" optional><Input name="companyName" defaultValue={initial.companyName} /></Field>
            <Field label="Téléphone" optional><Input name="contactPhone" defaultValue={initial.contactPhone} /></Field>
            <Field label="E-mail" optional><Input name="contactEmail" type="email" defaultValue={initial.contactEmail} /></Field>
          </>
        )}
      </section>
      <LineEditor lines={lines} setLines={setLines} customerId={customer?.id} />
      <section className="grid gap-4 rounded-xl border border-line bg-white p-5 md:grid-cols-2">
        <Field label="Conditions (affichées sur le devis)" optional><Textarea name="conditions" rows={3} defaultValue={initial.conditions} placeholder="Délai de livraison, conditions de paiement, garantie…" /></Field>
        <Field label="Notes internes" optional><Textarea name="notes" rows={3} defaultValue={initial.notes} /></Field>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="dark">{initial.id ? "Enregistrer le devis" : "Créer le devis"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function PurchaseOrderEditor({ initial, suppliers, warehouses }: {
  initial: { id?: number; supplierId: string; warehouseId: string; expectedAt: string; notes: string; lines: EditorLine[] };
  suppliers: { id: number; name: string }[];
  warehouses: { id: number; name: string }[];
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(savePurchaseOrderAction, { status: "idle" });
  const [lines, setLines] = useState<EditorLine[]>(initial.lines);
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitCost: l.unitPrice, vatRate: l.vatRate })))} />
      <section className="grid gap-4 rounded-xl border border-line bg-white p-5 md:grid-cols-3">
        <Field label="Fournisseur">
          <Select name="supplierId" defaultValue={initial.supplierId}>
            <option value="">— Choisir —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Dépôt de réception"><Select name="warehouseId" defaultValue={initial.warehouseId}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        <Field label="Livraison prévue" optional><Input type="date" name="expectedAt" defaultValue={initial.expectedAt} /></Field>
      </section>
      <LineEditor lines={lines} setLines={setLines} mode="purchase" />
      <Field label="Notes" optional><Textarea name="notes" rows={2} defaultValue={initial.notes} /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="dark">{initial.id ? "Enregistrer" : "Créer la commande fournisseur"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
