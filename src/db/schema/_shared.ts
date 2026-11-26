import { customType, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Montants en dinars tunisiens : 3 décimales (millimes).
 * Drizzle renvoie les `numeric` sous forme de chaîne pour éviter toute perte
 * de précision ; on convertit uniquement à l'affichage.
 */
export const money = (name: string) =>
  numeric(name, { precision: 14, scale: 3 });

/** Quantités : décimales possibles (mètres de courroie, litres d'huile…). */
export const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });

/** Taux en pourcentage, ex. 19.00 pour une TVA à 19 %. */
export const rate = (name: string) => numeric(name, { precision: 5, scale: 2 });

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
