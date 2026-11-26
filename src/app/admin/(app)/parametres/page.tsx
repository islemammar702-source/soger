import Link from "next/link";
import { SettingsForm } from "@/components/admin/system-forms";
import { PageHeader, btn } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";
import { getSettings } from "@/server/settings";

export default async function SettingsPage() {
  const me = await requireStaff("settings.view");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Paramètres" description="Coordonnées de l'entreprise, fiscalité et conditions de vente." actions={me.can("settings.update") && <Link href="/admin/stock/depots" className={btn.outline}>Dépôts</Link>} />
      <SettingsForm values={settings} readOnly={!me.can("settings.update")} />
      <div className="mt-6 rounded-xl border border-line bg-white p-5 text-sm text-steel">
        <p className="font-semibold text-ink">Services externes (variables d&apos;environnement)</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Images produits : <code>CLOUDINARY_URL</code> — {process.env.CLOUDINARY_URL ? "configuré ✓" : "non configuré"}</li>
          <li>Envoi d&apos;e-mails (devis) : <code>RESEND_API_KEY</code> + <code>MAIL_FROM</code> — {process.env.RESEND_API_KEY && process.env.MAIL_FROM ? "configuré ✓" : "non configuré"}</li>
          <li>Signature des liens de documents : <code>APP_SECRET</code> — {process.env.APP_SECRET ? "configuré ✓" : "valeur dérivée (définissez APP_SECRET en production)"}</li>
        </ul>
      </div>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
