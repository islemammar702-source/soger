import type { Metadata } from "next";
import { SectorPage } from "@/components/site/sector-page";

export const metadata: Metadata = {
  title: "Industrie",
  description: "Roulements, transmission, hydraulique, pompes, moteurs, lubrifiants et outillage industriel.",
};

export default function IndustriePage() {
  return (
    <SectorPage
      sector="industrial"
      title="Industrie"
      description="Composants mécaniques, hydrauliques et fournitures pour la maintenance et la production."
    />
  );
}
