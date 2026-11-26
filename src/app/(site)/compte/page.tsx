import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";

export const metadata: Metadata = { title: "Espace client", robots: { index: false } };

export default function AccountPage() {
  return <ComingSoon title="Espace client" href="/compte" text="L'espace client (commandes, devis, factures, tarifs professionnels) arrive très bientôt." />;
}
