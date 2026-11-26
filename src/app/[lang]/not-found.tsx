import { LogoMark } from "@/components/site/logo";
import { Link } from "@/i18n/client";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <section className="grid flex-1 place-items-center bg-ink px-4 py-24 text-center text-white">
      <div>
        <LogoMark className="mx-auto size-14 text-white" />
        <p className="mt-8 font-display text-6xl font-bold">404</p>
        <h1 className="mt-3 text-xl font-semibold">{t.notFound.title}</h1>
        <p className="mt-2 text-white/60">{t.notFound.text}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium hover:bg-accent-hover">{t.notFound.home}</Link>
          <Link href="/produits" className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium hover:bg-white/10">{t.notFound.catalog}</Link>
        </div>
      </div>
    </section>
  );
}
