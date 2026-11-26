"use client";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import { submitQuoteRequest, type QuoteRequestState } from "@/server/quote-request";
import { cn } from "@/lib/utils";
import { useFormAction } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";

const field =
  "h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-steel/70 focus:border-accent focus:ring-4 focus:ring-accent/10 aria-[invalid=true]:border-danger";

export function QuoteForm({ defaultReferences = "", className }: { defaultReferences?: string; className?: string }) {
  const { t, fmt, message } = useI18n();
  const [state, onSubmit, pending] = useFormAction<QuoteRequestState>(submitQuoteRequest, { status: "idle" });

  if (state.status === "success") {
    return (
      <div className={cn("flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-line bg-white p-10 text-center shadow-soft", className)}>
        <CheckCircle2 className="size-12 text-accent" />
        <h3 className="mt-4 text-xl font-bold">{t.quoteForm.sentTitle}</h3>
        <p className="mt-2 max-w-sm text-sm text-steel">{fmt(t.quoteForm.sentText, { number: state.number })}</p>
      </div>
    );
  }

  const err = (k: string) => (state.status === "error" ? message(state.fieldErrors?.[k]?.[0]) || undefined : undefined);

  return (
    <form onSubmit={onSubmit} className={cn("rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-soft sm:p-7", className)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.quoteForm.name} error={err("name")}>
          <input name="name" autoComplete="name" required className={field} aria-invalid={!!err("name")} />
        </Field>
        <Field label={t.quoteForm.company} optional>
          <input name="company" autoComplete="organization" className={field} />
        </Field>
        <Field label={t.quoteForm.phone} error={err("phone")}>
          <input name="phone" type="tel" dir="ltr" autoComplete="tel" inputMode="tel" required placeholder="+216" className={cn(field, "rtl:text-right")} aria-invalid={!!err("phone")} />
        </Field>
        <Field label={t.quoteForm.email} optional error={err("email")}>
          <input name="email" type="email" autoComplete="email" className={field} aria-invalid={!!err("email")} />
        </Field>
        <Field label={t.quoteForm.references} optional className="sm:col-span-2">
          <input name="references" defaultValue={defaultReferences} placeholder={t.quoteForm.referencesPh} className={field} />
        </Field>
        <Field label={t.quoteForm.need} error={err("message")} className="sm:col-span-2">
          <textarea
            name="message"
            rows={4}
            required
            placeholder={t.quoteForm.needPh}
            className={cn(field, "h-auto resize-y py-3")}
            aria-invalid={!!err("message")}
          />
        </Field>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      </div>
      {state.status === "error" && <p role="alert" className="mt-4 text-sm text-danger">{message(state.message)}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent font-medium text-white transition hover:bg-accent-hover disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {t.quoteForm.send}
      </button>
    </form>
  );
}

function Field({ label, optional, error, className, children }: { label: string; optional?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-graphite">
        {label} {optional && <span className="font-normal text-steel">{t.common.optional}</span>}
      </span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
