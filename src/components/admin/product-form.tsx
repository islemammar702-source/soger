"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Star, Trash2, X } from "lucide-react";
import { checkFile, FileDrop, uploadOne } from "./image-manager";
import { saveProductAction } from "@/server/admin/products";
import type { FormState } from "@/server/account-actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useFormAction } from "@/components/ui/form";
import { formatTND } from "@/lib/utils";

type Option = { id: number; name: string; sector?: string };
type Attr = { key: string; label: string; value: string; unit: string };
export type ProductFormValues = {
  id?: number;
  sku: string;
  manufacturerRef: string;
  barcode: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  brandId: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  proPrice: string;
  vatRate: string;
  minStock: string;
  weightKg: string;
  status: string;
  isFeatured: boolean;
  isNew: boolean;
  isActive: boolean;
  attributes: Attr[];
  equivalents: string;
  compatibles: string;
  dimensions: string;
  /** Quantité physique dans le dépôt principal (vide = ne pas modifier). */
  stockQty: string;
};

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

function Margin({ cost, price }: { cost: string; price: string }) {
  const c = num(cost);
  const p = num(price);
  if (c == null || p == null || !(p > 0)) return <span className="text-steel">—</span>;
  const m = p - c;
  return (
    <span className={m < 0 ? "text-danger" : "text-accent-hover"}>
      {formatTND(m)} · {((m / p) * 100).toFixed(1).replace(".", ",")} % (coef. {(p / (c || 1)).toFixed(2).replace(".", ",")})
    </span>
  );
}

type Queued = { key: string; file: File; preview: string };

export function ProductForm({ values, categories, brands, canPublish, canSeeCost, canAdjustStock, warehouseName }: { values: ProductFormValues; categories: Option[]; brands: Option[]; canPublish: boolean; canSeeCost: boolean; canAdjustStock: boolean; warehouseName: string | null }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveProductAction, { status: "idle" });
  const router = useRouter();
  const [queued, setQueued] = useState<Queued[]>([]);
  const [queueMsg, setQueueMsg] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const done = useRef(false);

  // Création : une fois la fiche enregistrée, les photos choisies sont envoyées une par une, puis on ouvre la fiche.
  const createdId = state.status === "success" ? state.data?.id : undefined;
  useEffect(() => {
    if (!createdId || done.current) return;
    done.current = true;
    (async () => {
      const errors: string[] = [];
      for (const [i, q] of queued.entries()) {
        setSending(`Envoi des photos ${i + 1}/${queued.length}…`);
        const r = await uploadOne(Number(createdId), q.file);
        if (!r.ok) errors.push(r.message);
      }
      const ignored = Number(state.status === "success" ? state.data?.ignored : 0) || 0;
      const base = ignored ? `Produit créé. ${ignored} référence(s) liée(s) inconnue(s) ignorée(s).` : "Produit créé.";
      const msg = errors.length ? `${base} ${errors.length} photo(s) refusée(s) : ${errors.join(" ")}` : base;
      router.push(`/admin/produits/${createdId}?${errors.length ? "erreur" : "ok"}=${encodeURIComponent(msg)}`);
    })();
  }, [createdId]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueFiles = (files: File[]) => {
    const errs: string[] = [];
    const ok: Queued[] = [];
    for (const f of files) {
      const e = checkFile(f);
      if (e) errs.push(e);
      else ok.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, preview: URL.createObjectURL(f) });
    }
    setQueueMsg(errs.length ? errs.join(" ") : null);
    setQueued((q) => [...q, ...ok]);
  };
  const [prices, setPrices] = useState({ purchase: values.purchasePrice, sale: values.salePrice, pro: values.proPrice, vat: values.vatRate });
  const [attrs, setAttrs] = useState<Attr[]>(values.attributes);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  const ttc = (v: string) => {
    const n = num(v);
    return n == null ? "—" : formatTND(Math.round(n * (1 + Number(prices.vat) / 100) * 1000) / 1000);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1fr_340px]" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="attributes" value={JSON.stringify(attrs.filter((a) => a.label && a.value))} />

      <div className="space-y-6">
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Identification</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Désignation" error={err("name")} className="sm:col-span-2"><Input name="name" defaultValue={values.name} invalid={!!err("name")} /></Field>
            <Field label="Référence SOGER" error={err("sku")}><Input name="sku" defaultValue={values.sku} className="font-mono uppercase" invalid={!!err("sku")} /></Field>
            <Field label="Référence fabricant" optional><Input name="manufacturerRef" defaultValue={values.manufacturerRef} className="font-mono" /></Field>
            <Field label="Code-barres (EAN)" optional error={err("barcode")}><Input name="barcode" defaultValue={values.barcode} inputMode="numeric" className="font-mono" invalid={!!err("barcode")} /></Field>
            <Field label="Adresse de la page (slug)" optional hint="Généré automatiquement si vide" error={err("slug")}><Input name="slug" defaultValue={values.slug} invalid={!!err("slug")} /></Field>
            <Field label="Catégorie">
              <Select name="categoryId" defaultValue={values.categoryId}>
                <option value="">— Sans catégorie —</option>
                <optgroup label="Industrie">{categories.filter((c) => c.sector === "industrial").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                <optgroup label="Agriculture">{categories.filter((c) => c.sector === "agricultural").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              </Select>
            </Field>
            <Field label="Marque">
              <Select name="brandId" defaultValue={values.brandId}>
                <option value="">— Sans marque —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Description courte" optional hint="Affichée sur les cartes produit (300 caractères max.)" className="sm:col-span-2"><Input name="shortDescription" defaultValue={values.shortDescription} maxLength={300} /></Field>
            <Field label="Description détaillée" optional className="sm:col-span-2"><Textarea name="description" defaultValue={values.description} rows={5} /></Field>
          </div>
        </section>

        {!values.id && (
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold">Photos</h2>
            <p className="mb-4 text-xs text-steel">La première photo sera l&apos;image principale. Vous pourrez ensuite réordonner, remplacer ou supprimer les photos depuis la fiche.</p>
            {queued.length > 0 && (
              <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {queued.map((q, i) => (
                  <li key={q.key} className={`relative aspect-square overflow-hidden rounded-lg border bg-mist ${i === 0 ? "border-accent" : "border-line"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={q.preview} alt="" className="size-full object-contain p-1" />
                    {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-accent px-1 text-[10px] font-semibold text-white">Principale</span>}
                    <div className="absolute top-1 right-1 flex gap-1">
                      {i > 0 && <button type="button" aria-label="Choisir comme principale" onClick={() => setQueued((l) => [l[i], ...l.filter((_, j) => j !== i)])} className="grid size-6 place-items-center rounded bg-white/90"><Star className="size-3.5" /></button>}
                      <button type="button" aria-label="Retirer la photo" onClick={() => { URL.revokeObjectURL(q.preview); setQueued((l) => l.filter((_, j) => j !== i)); }} className="grid size-6 place-items-center rounded bg-white/90 text-danger"><X className="size-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <FileDrop onFiles={queueFiles} compact />
            {queueMsg && <p className="mt-2 text-sm text-danger">{queueMsg}</p>}
          </section>
        )}

        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Prix (HT, en dinars)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {canSeeCost ? (
              <Field label="Prix d'achat" optional error={err("purchasePrice")}><Input name="purchasePrice" defaultValue={values.purchasePrice} inputMode="decimal" onChange={(e) => setPrices((p) => ({ ...p, purchase: e.target.value }))} invalid={!!err("purchasePrice")} /></Field>
            ) : null}
            <Field label="Prix de vente public" error={err("salePrice")} hint={`TTC : ${ttc(prices.sale)}`}><Input name="salePrice" defaultValue={values.salePrice} inputMode="decimal" onChange={(e) => setPrices((p) => ({ ...p, sale: e.target.value }))} invalid={!!err("salePrice")} /></Field>
            <Field label="Prix professionnel" optional error={err("proPrice")} hint={`TTC : ${ttc(prices.pro)}`}><Input name="proPrice" defaultValue={values.proPrice} inputMode="decimal" onChange={(e) => setPrices((p) => ({ ...p, pro: e.target.value }))} invalid={!!err("proPrice")} /></Field>
            <Field label="TVA">
              <Select name="vatRate" defaultValue={values.vatRate} onChange={(e) => setPrices((p) => ({ ...p, vat: e.target.value }))}>
                {["19.00", "13.00", "7.00", "0.00"].map((v) => <option key={v} value={v}>{Number(v)} %</option>)}
              </Select>
            </Field>
            <Field label="Unité de vente"><Input name="unit" defaultValue={values.unit} list="units" /></Field>
            <Field label="Poids (kg)" optional><Input name="weightKg" defaultValue={values.weightKg} inputMode="decimal" /></Field>
            <Field label="Dimensions" optional hint="Ex. 25 × 52 × 15 mm" className="sm:col-span-2"><Input name="dimensions" defaultValue={values.dimensions} maxLength={120} /></Field>
          </div>
          <datalist id="units">{["pièce", "mètre", "kg", "litre", "boîte", "kit", "jeu", "rouleau", "bidon", "paire"].map((u) => <option key={u} value={u} />)}</datalist>
          {canSeeCost && (
            <dl className="mt-4 grid gap-2 rounded-lg bg-mist/70 p-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-steel">Marge sur prix public</dt><dd className="font-medium"><Margin cost={prices.purchase} price={prices.sale} /></dd></div>
              <div><dt className="text-xs text-steel">Marge sur prix pro</dt><dd className="font-medium"><Margin cost={prices.purchase} price={prices.pro} /></dd></div>
            </dl>
          )}
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Caractéristiques techniques</h2>
            <button type="button" onClick={() => setAttrs((a) => [...a, { key: "", label: "", value: "", unit: "" }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              <Plus className="size-4" /> Ajouter
            </button>
          </div>
          <p className="mb-3 text-xs text-steel">Les valeurs numériques (ex. 25) deviennent des filtres par plage sur le site. Utilisez le même libellé pour une même caractéristique.</p>
          {attrs.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-steel">Aucune caractéristique.</p>}
          <ul className="space-y-2">
            {attrs.map((a, i) => (
              <li key={i} className="grid grid-cols-[16px_1fr_1fr_80px_36px] items-center gap-2">
                <GripVertical className="size-4 text-steel/50" />
                <Input aria-label="Libellé" placeholder="Diamètre intérieur (d)" value={a.label} list="attr-labels" onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                <Input aria-label="Valeur" placeholder="25" value={a.value} onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
                <Input aria-label="Unité" placeholder="mm" value={a.unit} onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)))} />
                <button type="button" aria-label="Supprimer" onClick={() => setAttrs((x) => x.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-lg text-steel hover:bg-red-50 hover:text-danger"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <datalist id="attr-labels">{["Diamètre intérieur (d)", "Diamètre extérieur (D)", "Largeur (B)", "Étanchéité", "Diamètre d'arbre", "Puissance", "Vitesse", "Débit max", "Hauteur max", "Pression max", "Profil", "Longueur", "Pas", "Matière", "Tension"].map((l) => <option key={l} value={l} />)}</datalist>
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Produits liés</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Équivalents (autres marques)" optional hint="Références SOGER séparées par des virgules"><Input name="equivalents" defaultValue={values.equivalents} className="font-mono" /></Field>
            <Field label="Compatibles (accessoires, consommables)" optional hint="Références SOGER séparées par des virgules"><Input name="compatibles" defaultValue={values.compatibles} className="font-mono" /></Field>
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Publication</h2>
          <Field label="Statut">
            <Select name="status" defaultValue={values.status}>
              <option value="draft">Brouillon (non visible)</option>
              {(canPublish || values.status === "published") && <option value="published">Publié sur le site</option>}
              <option value="archived">Archivé</option>
            </Select>
          </Field>
          <div className="mt-4 space-y-2.5 text-sm">
            <label className="flex items-center gap-2.5"><input type="checkbox" name="isActive" defaultChecked={values.isActive} className="size-4 accent-[var(--color-accent)]" /> Actif (vendable)</label>
            <label className="flex items-center gap-2.5"><input type="checkbox" name="isFeatured" defaultChecked={values.isFeatured} className="size-4 accent-[var(--color-accent)]" /> Produit populaire (accueil)</label>
            <label className="flex items-center gap-2.5"><input type="checkbox" name="isNew" defaultChecked={values.isNew} className="size-4 accent-[var(--color-accent)]" /> Nouveauté</label>
          </div>
          {canAdjustStock && warehouseName && (
            <Field label={values.id ? "Quantité en stock" : "Stock initial"} optional className="mt-4" error={err("stockQty")} hint={`Dépôt : ${warehouseName}. ${values.id ? "Une correction crée un mouvement de stock tracé." : "Enregistré comme stock d'ouverture."}`}>
              <Input name="stockQty" defaultValue={values.stockQty} inputMode="decimal" invalid={!!err("stockQty")} />
              <input type="hidden" name="stockBase" value={values.stockQty} />
            </Field>
          )}
          <Field label="Stock minimum (alerte)" className="mt-4"><Input name="minStock" defaultValue={values.minStock} inputMode="decimal" /></Field>
        </section>
        {sending ? <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-hover">{sending}</p> : !createdId && <FormMessage state={state} />}
        <SubmitButton pending={pending || !!createdId} className="h-12 w-full" pendingLabel="Enregistrement…">{values.id ? "Enregistrer les modifications" : "Créer le produit"}</SubmitButton>
      </aside>
    </form>
  );
}
