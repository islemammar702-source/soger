"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Eye, EyeOff, User } from "lucide-react";
import { loginAction, registerAction, type FormState } from "@/server/account-actions";
import { cn } from "@/lib/utils";
import { Field, FormMessage, Input, SubmitButton, useFormAction } from "@/components/ui/form";

function PasswordInput({ name, autoComplete, invalid }: { name: string; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input name={name} type={show ? "text" : "password"} autoComplete={autoComplete} invalid={invalid} className="pr-11" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-steel hover:text-ink">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ area, next }: { area: "customer" | "staff"; next?: string }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(loginAction, { status: "idle" });
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="area" value={area} />
      {next && <input type="hidden" name="suite" value={next} />}
      <Field label="E-mail"><Input name="email" type="email" autoComplete="email" autoFocus required /></Field>
      <Field label="Mot de passe"><PasswordInput name="password" autoComplete="current-password" /></Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="h-12 w-full" variant={area === "staff" ? "dark" : "primary"} pendingLabel="Connexion…">Se connecter</SubmitButton>
      {area === "customer" && (
        <p className="text-center text-sm text-steel">
          Pas encore de compte ? <Link href="/compte/inscription" className="font-semibold text-accent">Créer un compte</Link>
        </p>
      )}
      <p className="text-center text-xs text-steel">Mot de passe oublié ? Contactez SOGER pour le réinitialiser.</p>
      {area === "customer" && (
        <p className="border-t border-line pt-4 text-center text-sm text-steel">
          Personnel SOGER ? <Link href="/admin/connexion" prefetch={false} className="font-semibold text-ink underline-offset-4 hover:underline">Accéder à l&apos;espace gestion</Link>
        </p>
      )}
    </form>
  );
}

export function RegisterForm() {
  const [state, onSubmit, pending] = useFormAction<FormState>(registerAction, { status: "idle" });
  const [type, setType] = useState<"individual" | "professional">("individual");
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        {([["individual", "Particulier", User, "Achats personnels"], ["professional", "Professionnel", Building2, "Facture société et tarifs pros"]] as const).map(([v, title, Icon, text]) => (
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
        <Field label="Nom et prénom" error={err("name")}><Input name="name" autoComplete="name" invalid={!!err("name")} /></Field>
        <Field label="Téléphone" error={err("phone")}><Input name="phone" type="tel" autoComplete="tel" invalid={!!err("phone")} /></Field>
        <Field label="E-mail" error={err("email")} className="sm:col-span-2"><Input name="email" type="email" autoComplete="email" invalid={!!err("email")} /></Field>
        {type === "professional" && (
          <>
            <Field label="Raison sociale" error={err("company")}><Input name="company" autoComplete="organization" invalid={!!err("company")} /></Field>
            <Field label="Matricule fiscal" error={err("taxId")}><Input name="taxId" invalid={!!err("taxId")} /></Field>
            <Field label="Activité" optional className="sm:col-span-2"><Input name="activity" placeholder="Maintenance industrielle, garage, exploitation agricole…" /></Field>
          </>
        )}
        <Field label="Adresse" optional className="sm:col-span-2"><Input name="address" autoComplete="street-address" /></Field>
        <Field label="Ville" optional><Input name="city" autoComplete="address-level2" /></Field>
        <Field label="Gouvernorat" optional><Input name="governorate" /></Field>
        <Field label="Mot de passe" error={err("password")} hint="10 caractères minimum, lettres et chiffres" className="sm:col-span-2">
          <PasswordInput name="password" autoComplete="new-password" invalid={!!err("password")} />
        </Field>
      </div>

      {type === "professional" && (
        <p className="rounded-lg bg-mist px-4 py-3 text-sm text-graphite">
          Vos tarifs professionnels sont activés après vérification de votre matricule fiscal par notre équipe.
        </p>
      )}
      <label className="flex items-start gap-3 text-sm text-graphite">
        <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-[var(--color-accent)]" />
        <span>J&apos;accepte que SOGER utilise mes informations pour traiter mes commandes et devis.</span>
      </label>
      {err("terms") && <p className="text-xs text-danger">{err("terms")}</p>}
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="h-12 w-full" pendingLabel="Création du compte…">Créer mon compte</SubmitButton>
      <p className="text-center text-sm text-steel">
        Déjà inscrit ? <Link href="/compte/connexion" className="font-semibold text-accent">Se connecter</Link>
      </p>
    </form>
  );
}
