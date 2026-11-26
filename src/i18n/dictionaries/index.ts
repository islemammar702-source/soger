import type { Locale } from "../config";
import ar from "./ar";
import en from "./en";
import fr, { type Dict } from "./fr";

export const DICTIONARIES: Record<Locale, Dict> = { fr, en, ar };
export type { Dict };
