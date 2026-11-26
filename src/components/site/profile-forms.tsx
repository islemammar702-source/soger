"use client";

import { changePasswordAction, updateProfileAction, type FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, SubmitButton, useFormAction } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";

type Values = Record<"name" | "email" | "phone" | "company" | "taxId" | "activity" | "address" | "city" | "governorate" | "postalCode", string>;

export function ProfileForm({ values, professional, taxIdLocked }: { values: Values; professional: boolean; taxIdLocked: boolean }) {
  const { t } = useI18n();
  const a = t.account;
  const [state, onSubmit, pending] = useFormAction<FormState>(updateProfileAction, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">{a.details}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.name} error={err("name")}><Input name="name" defaultValue={values.name} invalid={!!err("name")} /></Field>
        <Field label={t.auth.email} hint={a.emailHint}><Input value={values.email} disabled readOnly /></Field>
        <Field label={t.auth.phone} error={err("phone")}><Input name="phone" dir="ltr" defaultValue={values.phone} invalid={!!err("phone")} className="rtl:text-right" /></Field>
        <Field label={a.company} optional><Input name="company" defaultValue={values.company} /></Field>
        {professional && (
          <>
            <Field label={t.auth.taxId} hint={taxIdLocked ? a.taxIdValidated : undefined}>
              <Input name="taxId" defaultValue={values.taxId} readOnly={taxIdLocked} disabled={taxIdLocked} />
            </Field>
            <Field label={t.auth.activity} optional><Input name="activity" defaultValue={values.activity} /></Field>
          </>
        )}
        <Field label={t.auth.address} optional className="sm:col-span-2"><Input name="address" defaultValue={values.address} /></Field>
        <Field label={t.auth.city} optional><Input name="city" defaultValue={values.city} /></Field>
        <Field label={t.auth.governorate} optional><Input name="governorate" defaultValue={values.governorate} /></Field>
        <Field label={a.postalCode} optional><Input name="postalCode" defaultValue={values.postalCode} /></Field>
      </div>
      <div className="mt-5 space-y-3">
        <FormMessage state={state} />
        <SubmitButton pending={pending}>{a.save}</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  const a = t.account;
  const [state, onSubmit, pending] = useFormAction<FormState>(changePasswordAction, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">{a.passwordTitle}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={a.currentPassword} error={err("current")}><Input name="current" type="password" autoComplete="current-password" invalid={!!err("current")} /></Field>
        <Field label={a.newPassword} error={err("next")} hint={t.auth.passwordHint}><Input name="next" type="password" autoComplete="new-password" invalid={!!err("next")} /></Field>
      </div>
      <div className="mt-5 space-y-3">
        <FormMessage state={state} />
        <SubmitButton pending={pending} variant="dark">{a.changePassword}</SubmitButton>
      </div>
    </form>
  );
}
