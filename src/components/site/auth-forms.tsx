"use client";

import { useState } from "react";
import { Building2, Eye, EyeOff, User } from "lucide-react";
import { loginAction, registerAction, type FormState } from "@/server/account-actions";
import { cn } from "@/lib/utils";
import { Link, useI18n } from "@/i18n/client";
import { Field, FormMessage, Input, SubmitButton, useFormAction } from "@/components/ui/form";

function PasswordInput({ name, autoComplete, invalid }: { name: string; autoComplete: string; invalid?: boolean }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input name={name} type={show ? "text" : "password"} autoComplete={autoComplete} invalid={invalid} className="pe-11" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t.auth.hidePassword : t.auth.showPassword} className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-steel hover:text-ink">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ area, next }: { area: "customer" | "staff"; next?: string }) {
  const { t, locale } = useI18n();
  const [state, onSubmit, pending] = useFormAction<FormState>(loginAction, { status: "idle" });
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="area" value={area} />
      {area === "customer" && <input type="hidden" name="lang" value={locale} />}
      {next && <input type="hidden" name="suite" value={next} />}
      <Field label={t.auth.email}><Input name="email" type="email" autoComplete="email" autoFocus required /></Field>
      <Field label={t.auth.password}><PasswordInput name="password" autoComplete="current-password" /></Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="h-12 w-full" variant={area === "staff" ? "dark" : "primary"} pendingLabel={t.auth.loggingIn}>{t.auth.login}</SubmitButton>
      {area === "customer" && (
        <p className="text-center text-sm text-steel">
          {t.auth.noAccount} <Link href="/compte/inscription" className="font-semibold text-accent">{t.auth.createAccount}</Link>
        </p>
      )}
      <p className="text-center text-xs text-steel">{t.auth.forgot}</p>
      {area === "customer" && (
        <p className="border-t border-line pt-4 text-center text-sm text-steel">
          {t.auth.staff} <Link href="/admin/connexion" prefetch={false} className="font-semibold text-ink underline-offset-4 hover:underline">{t.auth.staffLink}</Link>
        </p>
      )}
    </form>
  );
}

export function RegisterForm() {
  const { t, locale, message } = useI18n();
  const a = t.auth;
  const [state, onSubmit, pending] = useFormAction<FormState>(registerAction, { status: "idle" });
  const [type, setType] = useState<"individual" | "professional">("individual");
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        {([["individual", a.individual, User, a.individualText], ["professional", a.professional, Building2, a.professionalText]] as const).map(([v, title, Icon, text]) => (
          <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 transition", type === v ? "border-accent bg-accent-soft/40 ring-2 ring-accent/20" : "border-line hover:border-ink/30")}>
            <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} className="sr-only" />
            <Icon className={cn("size-5", type === v ? "text-accent" : "text-steel")} />
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-steel">{text}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={a.name} error={err("name")}><Input name="name" autoComplete="name" invalid={!!err("name")} /></Field>
        <Field label={a.phone} error={err("phone")}><Input name="phone" type="tel" dir="ltr" autoComplete="tel" invalid={!!err("phone")} className="rtl:text-right" /></Field>
        <Field label={a.email} error={err("email")} className="sm:col-span-2"><Input name="email" type="email" autoComplete="email" invalid={!!err("email")} /></Field>
        {type === "professional" && (
          <>
            <Field label={a.companyName} error={err("company")}><Input name="company" autoComplete="organization" invalid={!!err("company")} /></Field>
            <Field label={a.taxId} error={err("taxId")}><Input name="taxId" invalid={!!err("taxId")} /></Field>
            <Field label={a.activity} optional className="sm:col-span-2"><Input name="activity" placeholder={a.activityPh} /></Field>
          </>
        )}
        <Field label={a.address} optional className="sm:col-span-2"><Input name="address" autoComplete="street-address" /></Field>
        <Field label={a.city} optional><Input name="city" autoComplete="address-level2" /></Field>
        <Field label={a.governorate} optional><Input name="governorate" /></Field>
        <Field label={a.password} error={err("password")} hint={a.passwordHint} className="sm:col-span-2">
          <PasswordInput name="password" autoComplete="new-password" invalid={!!err("password")} />
        </Field>
      </div>

      {type === "professional" && (
        <p className="rounded-lg bg-mist px-4 py-3 text-sm text-graphite">
          {a.proNote}
        </p>
      )}
      <label className="flex items-start gap-3 text-sm text-graphite">
        <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-[var(--color-accent)]" />
        <span>{a.terms}</span>
      </label>
      <input type="hidden" name="lang" value={locale} />
      {err("terms") && <p className="text-xs text-danger">{message(err("terms"))}</p>}
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="h-12 w-full" pendingLabel={a.creating}>{a.submit}</SubmitButton>
      <p className="text-center text-sm text-steel">
        {a.already} <Link href="/compte/connexion" className="font-semibold text-accent">{a.signIn}</Link>
      </p>
    </form>
  );
}
