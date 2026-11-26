import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";

export const metadata: Metadata = { title: "Panier", robots: { index: false } };

export default function CartPage() {
  return <ComingSoon title="Panier" href="/panier" text="La commande en ligne arrive très bientôt. En attendant, envoyez-nous une demande de devis avec vos références." />;
}
