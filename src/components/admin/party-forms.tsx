"use client";

import { useState } from "react";
import { saveCustomerAction, saveSupplierAction } from "@/server/admin/parties";
import type { FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useFormAction } from "@/components/ui/form";

type CustomerValues = Record<"type" | "companyName" | "firstName" | "lastName" | "email" | "phone" | "taxId" | "activity" | "address" | "city" | "governorate" | "postalCode" | "creditLimit" | "notes", string> & { id?: number; isActive: boolean };

export function CustomerForm({ values, readOnly }: { values: CustomerValues; readOnly?: boolean }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveCustomerAction, { status: "idle" });
  const [type, setType] = useState(values.type);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-line bg-white p-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Type">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="individual">Particulier</option>
            <option value="professional">Professionnel</option>
          </Select>
        </Field>
        <Field label="Raison sociale" optional={type !== "professional"}><Input name="companyName" defaultValue={values.companyName} /></Field>
        <Field label="Matricule fiscal" optional={type !== "professional"} error={err("taxId")}><Input name="taxId" defaultValue={values.taxId} invalid={!!err("taxId")} /></Field>
        <Field label="Prénom" optional><Input name="firstName" defaultValue={values.firstName} /></Field>
        <Field label="Nom" error={err("lastName")}><Input name="lastName" defaultValue={values.lastName} invalid={!!err("lastName")} /></Field>
        <Field label="Activité" optional><Input name="activity" defaultValue={values.activity} /></Field>
        <Field label="Téléphone" optional><Input name="phone" defaultValue={values.phone} /></Field>
        <Field label="E-mail" optional error={err("email")}><Input name="email" type="email" defaultValue={values.email} invalid={!!err("email")} /></Field>
        <Field label="Plafond de crédit (DT)" optional><Input name="creditLimit" defaultValue={values.creditLimit} inputMode="decimal" /></Field>
        <Field label="Adresse" optional className="lg:col-span-2"><Input name="address" defaultValue={values.address} /></Field>
        <Field label="Ville" optional><Input name="city" defaultValue={values.city} /></Field>
        <Field label="Gouvernorat" optional><Input name="governorate" defaultValue={values.governorate} /></Field>
        <Field label="Code postal" optional><Input name="postalCode" defaultValue={values.postalCode} /></Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="isActive" defaultChecked={values.isActive} /> Client actif</label>
        <Field label="Notes internes" optional className="sm:col-span-2 lg:col-span-3"><Textarea name="notes" defaultValue={values.notes} rows={2} /></Field>
      </fieldset>
      {!readOnly && (
        <div className="mt-4 space-y-3">
          <FormMessage state={state} />
          <SubmitButton pending={pending} variant="dark">{values.id ? "Enregistrer" : "Créer le client"}</SubmitButton>
        </div>
      )}
    </form>
  );
}

type SupplierValues = Record<"name" | "contactName" | "email" | "phone" | "taxId" | "address" | "city" | "country" | "paymentTermsDays" | "notes", string> & { id?: number; isActive: boolean };

export function SupplierForm({ values, readOnly }: { values: SupplierValues; readOnly?: boolean }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveSupplierAction, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-line bg-white p-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Raison sociale" error={err("name")}><Input name="name" defaultValue={values.name} invalid={!!err("name")} /></Field>
        <Field label="Contact" optional><Input name="contactName" defaultValue={values.contactName} /></Field>
        <Field label="Matricule fiscal" optional><Input name="taxId" defaultValue={values.taxId} /></Field>
        <Field label="Téléphone" optional><Input name="phone" defaultValue={values.phone} /></Field>
        <Field label="E-mail" optional error={err("email")}><Input name="email" type="email" defaultValue={values.email} invalid={!!err("email")} /></Field>
        <Field label="Délai de paiement (jours)"><Input name="paymentTermsDays" type="number" min={0} defaultValue={values.paymentTermsDays} /></Field>
        <Field label="Adresse" optional className="lg:col-span-2"><Input name="address" defaultValue={values.address} /></Field>
        <Field label="Ville" optional><Input name="city" defaultValue={values.city} /></Field>
        <Field label="Pays"><Input name="country" defaultValue={values.country} /></Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="isActive" defaultChecked={values.isActive} /> Fournisseur actif</label>
        <Field label="Notes" optional className="sm:col-span-2 lg:col-span-3"><Textarea name="notes" defaultValue={values.notes} rows={2} /></Field>
      </fieldset>
      {!readOnly && (
        <div className="mt-4 space-y-3">
          <FormMessage state={state} />
          <SubmitButton pending={pending} variant="dark">{values.id ? "Enregistrer" : "Créer le fournisseur"}</SubmitButton>
        </div>
      )}
    </form>
  );
}
