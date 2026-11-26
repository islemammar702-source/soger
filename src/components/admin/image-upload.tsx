"use client";

import { addProductImageAction } from "@/server/admin/products";
import type { FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, SubmitButton, useFormAction } from "@/components/ui/form";

export function ImageUploadForm({ productId, uploadEnabled }: { productId: number; uploadEnabled: boolean }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(addProductImageAction, { status: "idle" });
  return (
    <form onSubmit={onSubmit} className="space-y-3" encType="multipart/form-data">
      <input type="hidden" name="productId" value={productId} />
      {uploadEnabled ? (
        <Field label="Fichier image" hint="JPEG, PNG ou WebP — 5 Mo max. Converti automatiquement en WebP/AVIF.">
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:font-medium" />
        </Field>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Envoi de fichiers désactivé : renseignez CLOUDINARY_URL pour l&apos;activer. En attendant, collez l&apos;adresse d&apos;une image.</p>
      )}
      <Field label={uploadEnabled ? "… ou adresse d'une image" : "Adresse de l'image"} optional={uploadEnabled}><Input name="url" type="url" placeholder="https://…" /></Field>
      <Field label="Texte alternatif" optional><Input name="alt" placeholder="Roulement 6205-2RS vue de face" /></Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="dark">Ajouter l&apos;image</SubmitButton>
    </form>
  );
}
