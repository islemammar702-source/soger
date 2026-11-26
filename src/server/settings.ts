import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * Paramètres modifiables dans le back-office (Paramètres).
 * ⚠️ Taux de TVA, droit de timbre et mentions légales : à faire valider par votre comptable.
 */
export const DEFAULT_SETTINGS = {
  company: {
    name: "SOGER",
    legalName: "SOGER – Société Générale de Roulement",
    taxId: "", // Matricule fiscal
    tradeRegister: "", // Registre de commerce
    address: "",
    city: "",
    phone: "",
    email: "",
    bank: "", // RIB / banque, affiché sur les factures
  },
  sales: {
    defaultVatRate: "19.00",
    /** Droit de timbre appliqué aux factures clients (en dinars). */
    stampDuty: "1.000",
    quoteValidityDays: 30,
    deliveryFee: "7.000",
    /** Livraison offerte à partir de ce montant TTC (vide = jamais). */
    freeDeliveryFrom: "" as string,
    invoiceFooter: "Merci de votre confiance.",
    paymentTermsDays: 30,
  },
};

export type AppSettings = typeof DEFAULT_SETTINGS;

export async function getSettings(): Promise<AppSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  const rows = await db.select().from(settings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<keyof AppSettings, object>>;
  return {
    company: { ...DEFAULT_SETTINGS.company, ...(stored.company ?? {}) },
    sales: { ...DEFAULT_SETTINGS.sales, ...(stored.sales ?? {}) },
  };
}
