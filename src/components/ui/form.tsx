"use client";

import { useActionState, useTransition, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-steel/70 focus:border-accent focus:ring-4 focus:ring-accent/10 aria-[invalid=true]:border-danger disabled:bg-mist disabled:text-steel";

export function Field({ label, hint, error, optional, className, children }: { label: string; hint?: string; error?: string; optional?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-graphite">
        {label} {optional && <span className="font-normal text-steel">(facultatif)</span>}
      </span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-steel">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cn(inputClass, "h-auto py-3", className)} {...props} />;
}

export function Select({ className, invalid, children, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select aria-invalid={invalid || undefined} className={cn(inputClass, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

/**
 * Comme useActionState, mais sans la remise à zéro automatique du formulaire
 * par React 19 : en cas d'erreur, l'utilisateur garde ce qu'il a saisi.
 */
export function useFormAction<S>(action: (state: Awaited<S>, form: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, actionPending] = useActionState<S, FormData>(action, initial);
  const [transitionPending, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(() => dispatch(data));
  };
  return [state, onSubmit, actionPending || transitionPending] as const;
}

export function SubmitButton({ children, className, variant = "primary", pendingLabel, pending: pendingProp }: { children: ReactNode; className?: string; variant?: "primary" | "dark" | "outline" | "danger"; pendingLabel?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition disabled:opacity-60",
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover",
        variant === "dark" && "bg-ink text-white hover:bg-graphite",
        variant === "outline" && "border border-line bg-white text-ink hover:bg-mist",
        variant === "danger" && "bg-danger text-white hover:bg-red-700",
        className,
      )}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { status: string; message?: string } }) {
  if (state.status === "error" && state.message)
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.message}
      </p>
    );
  if (state.status === "success" && state.message)
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-accent-soft px-3.5 py-2.5 text-sm text-accent-hover">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {state.message}
      </p>
    );
  return null;
}
