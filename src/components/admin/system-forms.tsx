"use client";

import { createStaffAction, resetPasswordAction, saveSettingsAction } from "@/server/admin/system";
import type { FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useFormAction } from "@/components/ui/form";
import type { AppSettings } from "@/server/settings";

export function CreateStaffForm({ roles }: { roles: { id: number; name: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(createStaffAction, { status: "idle" });
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nom"><Input name="name" required /></Field>
        <Field label="E-mail"><Input name="email" type="email" required /></Field>
        <Field label="Rôle"><Select name="roleId">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="dark">Créer le compte</SubmitButton>
    </form>
  );
}

export function ResetPasswordButton({ userId }: { userId: number }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(resetPasswordAction, { status: "idle" });
  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <input type="hidden" name="userId" value={userId} />
      <button disabled={pending} className="text-xs font-medium text-accent">{pending ? "…" : "Réinitialiser le mot de passe"}</button>
      {state.status !== "idle" && <p className={`max-w-56 text-xs ${state.status === "error" ? "text-danger" : "text-accent-hover"}`}>{"message" in state ? state.message : ""}</p>}
    </form>
  );
}

export function SettingsForm({ values, readOnly }: { values: AppSettings; readOnly: boolean }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveSettingsAction, { status: "idle" });
  const c = values.company;
  const s = values.sales;
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset disabled={readOnly} className="rounded-xl border border-line bg-white p-5">
        <legend className="px-1 text-sm font-semibold">Entreprise (en-tête des documents)</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nom commercial"><Input name="company.name" defaultValue={c.name} /></Field>
          <Field label="Raison sociale"><Input name="company.legalName" defaultValue={c.legalName} /></Field>
          <Field label="Matricule fiscal"><Input name="company.taxId" defaultValue={c.taxId} /></Field>
          <Field label="Registre de commerce"><Input name="company.tradeRegister" defaultValue={c.tradeRegister} /></Field>
          <Field label="Adresse"><Input name="company.address" defaultValue={c.address} /></Field>
          <Field label="Ville"><Input name="company.city" defaultValue={c.city} /></Field>
          <Field label="Téléphone"><Input name="company.phone" defaultValue={c.phone} /></Field>
          <Field label="E-mail"><Input name="company.email" defaultValue={c.email} /></Field>
          <Field label="Banque / RIB (factures)" className="sm:col-span-2 lg:col-span-1"><Input name="company.bank" defaultValue={c.bank} /></Field>
        </div>
      </fieldset>
      <fieldset disabled={readOnly} className="rounded-xl border border-line bg-white p-5">
        <legend className="px-1 text-sm font-semibold">Ventes et fiscalité</legend>
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Taux de TVA, droit de timbre et mentions légales : faites valider ces valeurs par votre comptable.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="TVA par défaut (nouveaux produits)">
            <Select name="sales.defaultVatRate" defaultValue={s.defaultVatRate}>{["19.00", "13.00", "7.00", "0.00"].map((v) => <option key={v} value={v}>{Number(v)} %</option>)}</Select>
          </Field>
          <Field label="Droit de timbre par facture (DT)"><Input name="sales.stampDuty" defaultValue={s.stampDuty} inputMode="decimal" /></Field>
          <Field label="Délai de paiement clients (jours)"><Input name="sales.paymentTermsDays" type="number" defaultValue={s.paymentTermsDays} /></Field>
          <Field label="Validité des devis (jours)"><Input name="sales.quoteValidityDays" type="number" defaultValue={s.quoteValidityDays} /></Field>
          <Field label="Frais de livraison TTC (DT)"><Input name="sales.deliveryFee" defaultValue={s.deliveryFee} inputMode="decimal" /></Field>
          <Field label="Livraison offerte dès (DT TTC)" optional><Input name="sales.freeDeliveryFrom" defaultValue={s.freeDeliveryFrom} inputMode="decimal" /></Field>
          <Field label="Pied de page des documents" className="sm:col-span-2 lg:col-span-3"><Textarea name="sales.invoiceFooter" defaultValue={s.invoiceFooter} rows={2} /></Field>
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending} variant="dark">Enregistrer les paramètres</SubmitButton>
          <FormMessage state={state} />
        </div>
      )}
    </form>
  );
}
