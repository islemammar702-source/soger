import { notFound } from "next/navigation";

/** Toute adresse inconnue du site affiche la page 404 traduite (avec en-tête et pied de page). */
export function generateStaticParams() {
  return [{ rest: ["_"] }];
}

export default function CatchAll() {
  notFound();
}
