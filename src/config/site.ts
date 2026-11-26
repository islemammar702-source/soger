/**
 * Coordonnées et réglages publics de SOGER.
 * ⚠️ Les valeurs marquées TODO sont des emplacements à remplacer par les
 * vraies informations de l'entreprise avant la mise en ligne.
 */
export const site = {
  name: "SOGER",
  legalName: "SOGER – Société Générale de Roulement",
  tagline: "Votre partenaire en matériel et solutions industrielles",
  description:
    "Fournitures industrielles, pièces mécaniques, composants hydrauliques et équipements professionnels. Matériel et pièces agricoles.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  contact: {
    phone: "" as string, // TODO : ex. "+216 71 000 000"
    whatsapp: "" as string, // TODO : numéro au format international sans « + », ex. "21620000000"
    email: "" as string, // TODO : ex. "contact@soger.tn"
    address: "" as string, // TODO : adresse du magasin
    city: "Tunisie" as string, // TODO : ville
    mapsUrl: "" as string, // TODO : lien Google Maps du magasin
    hours: [
      { days: "Lundi – Vendredi", time: "08:00 – 18:00" }, // TODO : vérifier
      { days: "Samedi", time: "08:00 – 13:00" }, // TODO : vérifier
    ],
  },
  /** Les prix de vente sont stockés HT ; affichage TTC pour le public. */
  pricesIncludeVat: true,
} as const;

export const mainNav = [
  { href: "/", label: "Accueil" },
  { href: "/industrie", label: "Industrie" },
  { href: "/agriculture", label: "Agriculture" },
  { href: "/marques", label: "Marques" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
] as const;

export function whatsappLink(message: string) {
  const n = site.contact.whatsapp;
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
