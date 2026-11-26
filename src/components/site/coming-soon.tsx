import { Construction } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageHero } from "./page-hero";

/** Page d'attente pour les modules des prochaines phases. */
export function ComingSoon({ title, href, text }: { title: string; href: string; text: string }) {
  return (
    <>
      <PageHero title={title} crumbs={[{ href, label: title }]} />
      <section className="container-soger flex flex-col items-center py-20 text-center">
        <Construction className="size-10 text-steel/60" />
        <p className="mt-4 max-w-md text-steel">{text}</p>
        <div className="mt-8 flex gap-3">
          <ButtonLink href="/produits">Voir le catalogue</ButtonLink>
          <ButtonLink href="/devis" variant="outline">Demander un devis</ButtonLink>
        </div>
      </section>
    </>
  );
}
