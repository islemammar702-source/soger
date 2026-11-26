"use client";

import { changePasswordAction, updateProfileAction, type FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, SubmitButton, useFormAction } from "@/components/ui/form";

type Values = Record<"name" | "email" | "phone" | "company" | "taxId" | "activity" | "address" | "city" | "governorate" | "postalCode", string>;

export function ProfileForm({ values, professional, taxIdLocked }: { values: Values; professional: boolean; taxIdLocked: boolean }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(updateProfileAction, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Coordonnées</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom et prénom" error={err("name")}><Input name="name" defaultValue={values.name} invalid={!!err("name")} /></Field>
        <Field label="E-mail" hint="Contactez-nous pour changer d'adresse"><Input value={values.email} disabled readOnly /></Field>
        <Field label="Téléphone" error={err("phone")}><Input name="phone" defaultValue={values.phone} invalid={!!err("phone")} /></Field>
        <Field label="Société" optional><Input name="company" defaultValue={values.company} /></Field>
        {professional && (
          <>
            <Field label="Matricule fiscal" hint={taxIdLocked ? "Validé par SOGER" : undefined}>
              <Input name="taxId" defaultValue={values.taxId} readOnly={taxIdLocked} disabled={taxIdLocked} />
            </Field>
            <Field label="Activité" optional><Input name="activity" defaultValue={values.activity} /></Field>
          </>
        )}
        <Field label="Adresse" optional className="sm:col-span-2"><Input name="address" defaultValue={values.address} /></Field>
        <Field label="Ville" optional><Input name="city" defaultValue={values.city} /></Field>
        <Field label="Gouvernorat" optional><Input name="governorate" defaultValue={values.governorate} /></Field>
        <Field label="Code postal" optional><Input name="postalCode" defaultValue={values.postalCode} /></Field>
      </div>
      <div className="mt-5 space-y-3">
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, onSubmit, pending] = useFormAction<FormState>(changePasswordAction, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Mot de passe</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mot de passe actuel" error={err("current")}><Input name="current" type="password" autoComplete="current-password" invalid={!!err("current")} /></Field>
        <Field label="Nouveau mot de passe" error={err("next")} hint="10 caractères minimum, lettres et chiffres"><Input name="next" type="password" autoComplete="new-password" invalid={!!err("next")} /></Field>
      </div>
      <div className="mt-5 space-y-3">
        <FormMessage state={state} />
        <SubmitButton pending={pending} variant="dark">Changer le mot de passe</SubmitButton>
      </div>
    </form>
  );
}
