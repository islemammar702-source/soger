import type { Metadata } from "next";
import { SectorPage } from "@/components/site/sector-page";

export const metadata: Metadata = {
  title: "Agriculture",
  description: "Pompes agricoles, irrigation, goutte-à-goutte, courroies et pièces de machines agricoles.",
};

export default function AgriculturePage() {
  return (
    <SectorPage
      sector="agricultural"
      title="Agriculture"
      description="Matériel d'irrigation et pièces de rechange pour machines agricoles."
    />
  );
}
