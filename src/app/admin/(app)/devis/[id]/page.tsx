import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, quoteItems, quotes } from "@/db/schema";
import { QuoteEditor } from "@/components/admin/doc-editors";
import { Card, Flash, PageHeader, btn } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS, formatDate, label } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { convertQuoteAction, emailQuoteAction, quoteStatusAction } from "@/server/admin/sales";
import { requireStaff } from "@/server/auth/dal";
import { documentUrl, whatsappTo } from "@/server/documents";

function StatusButton({ id, to, children, tone = btn.outline }: { id: number; to: string; children: React.ReactNode; tone?: string }) {
  return <form action={quoteStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><button className={tone}>{children}</button></form>;
}

export default async function QuotePage({ params, searchParams }: PageProps<"/admin/devis/[id]">) {
  const me = await requireStaff("quotes.view");
  const id = Number((await params).id);
  const sp = await searchParams;
  const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!q) notFound();
  const [items, [c], [order]] = await Promise.all([
    db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.sortOrder)),
    q.customerId ? db.select().from(customers).where(eq(customers.id, q.customerId)) : Promise.resolve([]),
    db.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.quoteId, id)),
  ]);
  const editable = ["draft", "sent"].includes(q.status) && me.can("quotes.update");
  const link = documentUrl("devis", id);
  const phone = c?.phone ?? q.contactPhone;
  const wa = whatsappTo(phone, `Bonjour, voici votre devis SOGER ${q.number} (${formatTND(q.total)}) : ${link}`);
  const name = c ? c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") : q.companyName || q.contactName || "";
  return (
    <>
      <PageHeader
        title={`Devis ${q.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={label(QUOTE_STATUS, q.status).tone}>{label(QUOTE_STATUS, q.status).label}</Badge> {name} · créé le {formatDate(q.createdAt)}{q.validUntil ? ` · valable jusqu'au ${formatDate(q.validUntil)}` : ""}</span>}
        back={{ href: "/admin/devis", label: "Devis" }}
        actions={
          <>
            <a href={`/documents/devis/${id}`} target="_blank" className={btn.outline}>PDF / Imprimer</a>
            {me.can("quotes.send") && q.status !== "converted" && (
              <>
                <form action={emailQuoteAction}><input type="hidden" name="id" value={id} /><button className={btn.outline}>Envoyer par e-mail</button></form>
                {wa && <a href={wa} target="_blank" rel="noopener" className={btn.outline}>WhatsApp</a>}
              </>
            )}
            {q.status === "draft" && me.can("quotes.send") && <StatusButton id={id} to="sent" tone={btn.dark}>Marquer envoyé</StatusButton>}
            {q.status === "sent" && me.can("quotes.update") && <><StatusButton id={id} to="accepted">Accepté</StatusButton><StatusButton id={id} to="rejected" tone={btn.danger}>Refusé</StatusButton></>}
            {["draft", "sent", "accepted"].includes(q.status) && me.can("quotes.convert") && <form action={convertQuoteAction}><input type="hidden" name="id" value={id} /><button className={btn.primary}>Convertir en commande</button></form>}
          </>
        }
      />
      <Flash sp={sp} />
      {order && <p className="mb-4 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800">Converti en commande <Link href={`/admin/commandes/${order.id}`} className="font-mono font-semibold underline">{order.number}</Link>.</p>}
      {q.source !== "backoffice" && q.notes && <Card title="Demande du client" className="mb-4"><p className="text-sm whitespace-pre-line text-graphite">{q.notes}</p></Card>}
      <p className="mb-4 text-xs text-steel">Lien client (sans compte) : <code className="break-all">{link}</code></p>
      {editable ? (
        <QuoteEditor
          initial={{
            id,
            customer: c ? { id: c.id, code: c.code, name, pro: c.type === "professional" && c.priceTier === "professional" } : null,
            contactName: q.contactName ?? "", contactPhone: q.contactPhone ?? "", contactEmail: q.contactEmail ?? "", companyName: q.companyName ?? "",
            validUntil: q.validUntil ?? "", conditions: q.conditions ?? "", notes: q.notes ?? "",
            lines: items.map((i) => ({ productId: i.productId, sku: i.sku, description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountRate: Number(i.discountRate), vatRate: Number(i.vatRate) })),
          }}
        />
      ) : (
        <Card title="Lignes" padded={false}>
          <table className="w-full text-sm">
            <tbody>{items.map((i) => <tr key={i.id} className="border-b border-line"><td className="p-3">{i.description}<p className="font-mono text-xs text-steel">{i.sku}</p></td><td className="p-3 text-right">{Number(i.quantity)} × {formatTND(i.unitPrice)}{Number(i.discountRate) ? ` −${Number(i.discountRate)} %` : ""}</td><td className="p-3 text-right font-semibold">{formatTND(i.lineTotal)}</td></tr>)}</tbody>
          </table>
          <p className="p-4 text-right text-lg font-bold">Total TTC {formatTND(q.total)}</p>
        </Card>
      )}
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
