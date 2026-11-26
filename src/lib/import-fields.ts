/** Colonnes importables (partagé entre l'écran de correspondance et le serveur). */
export const IMPORT_FIELDS = [
  { key: "sku", label: "Référence SOGER", required: true, aliases: ["sku", "reference", "référence", "ref", "code", "code article", "réf"] },
  { key: "name", label: "Désignation", aliases: ["name", "designation", "désignation", "libelle", "libellé", "nom", "article"] },
  { key: "manufacturerRef", label: "Réf. fabricant", aliases: ["ref fabricant", "réf. fabricant", "reference fabricant", "manufacturer", "ref constructeur"] },
  { key: "barcode", label: "Code-barres", aliases: ["ean", "code barre", "code-barres", "barcode", "gencod"] },
  { key: "brand", label: "Marque", aliases: ["marque", "brand", "fabricant"] },
  { key: "category", label: "Catégorie", aliases: ["categorie", "catégorie", "famille", "category"] },
  { key: "unit", label: "Unité", aliases: ["unite", "unité", "unit", "u"] },
  { key: "purchasePrice", label: "Prix d'achat HT", aliases: ["prix achat", "prix d'achat", "pa", "cout", "coût", "purchase"] },
  { key: "salePrice", label: "Prix de vente HT", aliases: ["prix vente", "prix de vente", "pv", "prix", "price", "prix ht"] },
  { key: "proPrice", label: "Prix pro HT", aliases: ["prix pro", "prix professionnel", "pro"] },
  { key: "vatRate", label: "TVA (%)", aliases: ["tva", "vat", "taux tva"] },
  { key: "stock", label: "Stock (quantité physique)", aliases: ["stock", "quantite", "quantité", "qte", "qté", "qty"] },
  { key: "minStock", label: "Stock minimum", aliases: ["stock min", "stock minimum", "seuil", "min"] },
  { key: "shortDescription", label: "Description courte", aliases: ["description courte", "resume", "résumé"] },
  { key: "description", label: "Description", aliases: ["description", "descriptif"] },
  { key: "status", label: "Statut (publié / brouillon)", aliases: ["statut", "status", "publie", "publié"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Propose une correspondance colonne → champ d'après le nom des en-têtes. */
export function suggestMapping(headers: string[]) {
  const mapping: Record<string, ImportFieldKey | ""> = {};
  const used = new Set<string>();
  headers.forEach((h) => {
    const n = norm(h);
    const f = IMPORT_FIELDS.find((f) => !used.has(f.key) && (norm(f.label) === n || f.aliases.some((a) => norm(a) === n)));
    mapping[h] = f ? f.key : "";
    if (f) used.add(f.key);
  });
  return mapping;
}
