/** Clés de tri utilisables côté client comme côté serveur. */
export const SORT_KEYS = ["pertinence", "prix-asc", "prix-desc", "nom", "nouveautes"] as const;

export const SORT_LABELS: Record<(typeof SORT_KEYS)[number], string> = {
  pertinence: "Pertinence",
  "prix-asc": "Prix croissant",
  "prix-desc": "Prix décroissant",
  nom: "Nom (A → Z)",
  nouveautes: "Nouveautés",
};
