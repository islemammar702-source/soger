import type { Metadata } from "next";
import { SectorPage } from "@/components/site/sector-page";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.sector.agriTitle, description: t.sector.agriMeta };
}

export default function AgriculturePage() {
  return <SectorPage sector="agricultural" />;
}
