import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { Toaster } from "@/components/ui/toast";
import { getCategories } from "@/server/catalog";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const categories = await getCategories();
  const industrial = categories.filter((c) => c.sector === "industrial");
  const agricultural = categories.filter((c) => c.sector === "agricultural");
  return (
    <>
      <Header categories={industrial.map(({ slug, name }) => ({ slug, name }))} />
      <main className="flex-1">{children}</main>
      <Footer industrial={industrial} agricultural={agricultural} />
      <Toaster />
    </>
  );
}
