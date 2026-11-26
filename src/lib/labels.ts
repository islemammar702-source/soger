/** Libellés et couleurs des statuts, partagés par l'espace client et le back-office. */
type Label = { label: string; tone: string };
const t = (label: string, tone: string): Label => ({ label, tone });

const gray = "bg-steel/10 text-graphite";
const green = "bg-accent-soft text-accent-hover";
const amber = "bg-amber-50 text-amber-700";
const blue = "bg-sky-50 text-sky-700";
const red = "bg-red-50 text-red-700";
const violet = "bg-violet-50 text-violet-700";

export const ORDER_STATUS: Record<string, Label> = {
  pending: t("En attente", amber),
  confirmed: t("Confirmée", blue),
  preparing: t("En préparation", violet),
  shipped: t("Expédiée", blue),
  delivered: t("Livrée", green),
  cancelled: t("Annulée", red),
  returned: t("Retournée", gray),
};

export const PAYMENT_STATUS: Record<string, Label> = {
  unpaid: t("Non payée", amber),
  partial: t("Paiement partiel", violet),
  paid: t("Payée", green),
  refunded: t("Remboursée", gray),
};

export const QUOTE_STATUS: Record<string, Label> = {
  draft: t("Brouillon", gray),
  sent: t("Envoyé", blue),
  accepted: t("Accepté", green),
  rejected: t("Refusé", red),
  expired: t("Expiré", amber),
  converted: t("Converti en commande", violet),
};

export const INVOICE_STATUS: Record<string, Label> = {
  draft: t("Brouillon", gray),
  issued: t("Émise", blue),
  partially_paid: t("Partiellement payée", violet),
  paid: t("Payée", green),
  cancelled: t("Annulée", red),
};

export const PO_STATUS: Record<string, Label> = {
  draft: t("Brouillon", gray),
  sent: t("Envoyé", blue),
  partially_received: t("Reçu partiellement", violet),
  received: t("Reçu", green),
  cancelled: t("Annulé", red),
};

export const PAYMENT_METHOD: Record<string, string> = {
  cash: "Espèces",
  card: "Carte",
  transfer: "Virement",
  check: "Chèque",
  cash_on_delivery: "À la livraison",
  other: "Autre",
};

export const CHANNEL: Record<string, string> = { online: "En ligne", store: "Boutique", quote: "Devis" };

export const MOVEMENT_TYPE: Record<string, string> = {
  purchase_receipt: "Réception fournisseur",
  sale: "Vente",
  customer_return: "Retour client",
  supplier_return: "Retour fournisseur",
  transfer_in: "Transfert (entrée)",
  transfer_out: "Transfert (sortie)",
  adjustment: "Ajustement",
  inventory: "Inventaire",
  opening: "Stock initial",
};

export const label = (map: Record<string, Label>, key: string) => map[key] ?? t(key, gray);

const dateFmt = new Intl.DateTimeFormat("fr-TN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Tunis" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-TN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });
export const formatDate = (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const formatDateTime = (d: Date | string | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "—");
