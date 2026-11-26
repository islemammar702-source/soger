import type { Metadata } from "next";
import { SectorPage } from "@/components/site/sector-page";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.sector.industryTitle, description: t.sector.industryMeta };
}

export default function IndustriePage() {
  return <SectorPage sector="industrial" />;
}
