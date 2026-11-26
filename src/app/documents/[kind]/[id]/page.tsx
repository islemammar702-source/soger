import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoiceItems, invoices, orderItems, orders, purchaseItems, purchaseOrders, quoteItems, quotes, suppliers, warehouses } from "@/db/schema";
import { LogoMark } from "@/components/site/logo";
import { PAYMENT_METHOD, formatDate, formatDateTime } from "@/lib/labels";
import { documentTotals } from "@/lib/totals";
import { formatTND } from "@/lib/utils";
import { getCurrentCustomer, getCurrentUser, getUserAccess } from "@/server/auth/dal";
import { verifyDocument } from "@/server/documents";
import { getSettings } from "@/server/settings";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Document", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return [{ kind: "devis", id: "0" }];
}

type Line = { description: string; sku: string | null; quantity: string; unitPrice: string; discountRate: string; vatRate: string; lineTotal: string };
type Doc = {
  title: string;
  number: string;
  date: Date | string;
  extra: [string, string][];
  party: { title: string; name: string; lines: string[] };
  lines: Line[];
  shipping?: number;
  stamp?: number;
  total: string;
  paid?: string;
  footer?: string | null;
  conditions?: string | null;
  showPrices: boolean;
};

/** Contrôle d'accès : personnel autorisé, client propriétaire, ou lien signé. */
async function load(kind: string, id: number, token?: string): Promise<Doc | "denied" | null> {
  const user = await getCurrentUser();
  const staff = user?.kind === "staff" ? await getUserAccess(user.id) : null;
  const me = await getCurrentCustomer();
  const can = (p: Parameters<NonNullable<typeof staff>["permissions"]["has"]>[0]) => !!staff?.permissions.has(p);
  const partyOf = async (customerId: number | null) => {
    const [c] = customerId ? await db.select().from(customers).where(eq(customers.id, customerId)) : [];
    return c
      ? { name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" "), lines: [c.taxId ? `MF : ${c.taxId}` : "", [c.address, c.postalCode, c.city].filter(Boolean).join(", "), c.phone ?? "", `Client ${c.code}`].filter(Boolean) }
      : null;
  };

  if (kind === "devis") {
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!q) return null;
    if (!(can("quotes.view") || (me && q.customerId === me.customer.id && q.status !== "draft") || verifyDocument("devis", id, token))) return "denied";
    const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.sortOrder));
    const p = (await partyOf(q.customerId)) ?? { name: q.companyName || q.contactName || "", lines: [q.contactPhone ?? "", q.contactEmail ?? ""].filter(Boolean) };
    return { title: "DEVIS", number: q.number, date: q.createdAt, extra: q.validUntil ? [["Valable jusqu'au", formatDate(q.validUntil)]] : [], party: { title: "Client", ...p }, lines: items, total: q.total, conditions: q.conditions, showPrices: true };
  }
  if (kind === "facture") {
    const [f] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!f || f.kind === "supplier") return null;
    if (!(can("invoices.view") || (me && f.customerId === me.customer.id && f.status !== "draft") || verifyDocument("facture", id, token))) return "denied";
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder));
    return {
      title: f.kind === "credit_note" ? "AVOIR" : "FACTURE",
      number: f.number,
      date: f.issueDate,
      extra: [...(f.dueDate ? ([["Échéance", formatDate(f.dueDate)]] as [string, string][]) : []), ...(f.status === "cancelled" ? ([["Statut", "Annulée (avoir émis)"]] as [string, string][]) : [])],
      party: { title: "Facturé à", name: f.billingName ?? "", lines: [f.billingTaxId ? `MF : ${f.billingTaxId}` : "", f.billingAddress ?? ""].filter(Boolean) },
      lines: items,
      stamp: Number(f.stampDuty),
      total: f.total,
      paid: f.amountPaid,
      footer: f.notes,
      showPrices: true,
    };
  }
  if (kind === "commande" || kind === "ticket") {
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    if (!o) return null;
    if (!(can("orders.view") || can("pos.use") || (me && o.customerId === me.customer.id))) return "denied";
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.sortOrder));
    const p = (await partyOf(o.customerId)) ?? { name: o.shippingName ?? "Client comptoir", lines: [] };
    return {
      title: kind === "ticket" ? "TICKET" : "BON DE LIVRAISON",
      number: o.number,
      date: o.createdAt,
      extra: [["Réception", o.deliveryMethod ?? "—"], ...(o.paymentMethod ? ([["Paiement", PAYMENT_METHOD[o.paymentMethod]]] as [string, string][]) : [])],
      party: { title: kind === "ticket" ? "Client" : "Livré à", name: p.name, lines: [...p.lines, [o.shippingAddress, o.shippingCity].filter(Boolean).join(", ")].filter(Boolean) },
      lines: items,
      shipping: Number(o.shippingTotal),
      total: o.total,
      paid: o.amountPaid,
      // Le bon de livraison ne montre pas les prix (remis au transporteur / magasinier).
      showPrices: kind === "ticket",
    };
  }
  if (kind === "achat") {
    if (!can("purchases.view")) return "denied";
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po) return null;
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId));
    const [w] = po.warehouseId ? await db.select().from(warehouses).where(eq(warehouses.id, po.warehouseId)) : [];
    const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseOrderId, id)).orderBy(asc(purchaseItems.id));
    return {
      title: "BON DE COMMANDE",
      number: po.number,
      date: po.createdAt,
      extra: [...(po.expectedAt ? ([["Livraison souhaitée", formatDate(po.expectedAt)]] as [string, string][]) : []), ["Livrer à", w?.name ?? "—"]],
      party: { title: "Fournisseur", name: s.name, lines: [s.contactName ?? "", s.phone ?? "", s.email ?? "", s.taxId ? `MF : ${s.taxId}` : ""].filter(Boolean) },
      lines: items.map((i) => ({ description: i.description, sku: null, quantity: i.quantityOrdered, unitPrice: i.unitCost, discountRate: "0", vatRate: i.vatRate, lineTotal: i.lineTotal })),
      total: po.total,
      conditions: po.notes,
      showPrices: true,
    };
  }
  return null;
}

async function DocumentView({ params, searchParams }: PageProps<"/documents/[kind]/[id]">) {
  const { kind, id } = await params;
  const sp = await searchParams;
  const doc = await load(kind, Number(id), typeof sp.t === "string" ? sp.t : undefined);
  if (!doc) notFound();
  if (doc === "denied") return <p className="p-10 text-center text-sm">Accès refusé : connectez-vous ou utilisez le lien reçu.</p>;
  const s = await getSettings();
  const t = documentTotals(
    doc.lines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountRate: Number(l.discountRate), vatRate: Number(l.vatRate) })),
    { shipping: doc.shipping, shippingVatRate: doc.shipping ? 19 : 0, stampDuty: doc.stamp },
  );
  const ticket = kind === "ticket";

  if (ticket) {
    return (
      <div className="mx-auto w-[80mm] bg-white p-3 font-mono text-[11px] leading-tight text-black print:p-0">
        <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
        <p className="text-center text-sm font-bold">{s.company.name}</p>
        <p className="text-center">{[s.company.address, s.company.city].filter(Boolean).join(", ")}</p>
        {s.company.phone && <p className="text-center">Tél. {s.company.phone}</p>}
        {s.company.taxId && <p className="text-center">MF {s.company.taxId}</p>}
        <p className="my-2 border-y border-dashed border-black py-1 text-center">{doc.number} — {formatDateTime(doc.date)}</p>
        {doc.lines.map((l, i) => (
          <div key={i} className="mb-1">
            <p>{l.description}</p>
            <p className="flex justify-between"><span>{Number(l.quantity)} × {formatTND(Number(l.unitPrice) * (1 + Number(l.vatRate) / 100))}{Number(l.discountRate) ? ` −${Number(l.discountRate)}%` : ""}</span><span>{formatTND(t.lines[i].total)}</span></p>
          </div>
        ))}
        <div className="mt-2 border-t border-dashed border-black pt-1">
          <p className="flex justify-between"><span>Total HT</span><span>{formatTND(t.netTotal)}</span></p>
          {t.vatBreakdown.map((v) => <p key={v.rate} className="flex justify-between"><span>TVA {v.rate}% sur {formatTND(v.base)}</span><span>{formatTND(v.vat)}</span></p>)}
          <p className="flex justify-between text-sm font-bold"><span>TOTAL TTC</span><span>{formatTND(doc.total)}</span></p>
          {doc.paid && <p className="flex justify-between"><span>Payé</span><span>{formatTND(doc.paid)}</span></p>}
        </div>
        <p className="mt-3 text-center">{s.sales.invoiceFooter}</p>
        <PrintButton auto />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-[12.5px] text-ink print:p-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <LogoMark className="size-12 text-ink" />
          <div>
            <p className="font-display text-xl font-bold">{s.company.legalName}</p>
            <p className="text-xs text-steel">{[s.company.address, s.company.city].filter(Boolean).join(", ")}</p>
            <p className="text-xs text-steel">{[s.company.phone, s.company.email].filter(Boolean).join(" · ")}</p>
            <p className="text-xs text-steel">{[s.company.taxId && `MF ${s.company.taxId}`, s.company.tradeRegister && `RC ${s.company.tradeRegister}`].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold tracking-wide">{doc.title}</p>
          <p className="font-mono text-sm">{doc.number}</p>
          <p className="text-xs text-steel">Date : {formatDate(doc.date)}</p>
          {doc.extra.map(([k, v]) => <p key={k} className="text-xs text-steel">{k} : {v}</p>)}
        </div>
      </div>
      <div className="mt-8 ml-auto w-1/2 rounded-lg border border-line p-4">
        <p className="text-[10px] font-semibold tracking-wider text-steel uppercase">{doc.party.title}</p>
        <p className="mt-1 font-semibold">{doc.party.name}</p>
        {doc.party.lines.map((l) => <p key={l} className="text-xs text-graphite">{l}</p>)}
      </div>
      <table className="mt-8 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-ink text-left text-[10px] tracking-wider uppercase">
            <th className="py-2">Désignation</th><th className="py-2 text-right">Qté</th>
            {doc.showPrices && <><th className="py-2 text-right">PU HT</th><th className="py-2 text-right">Rem.</th><th className="py-2 text-right">TVA</th><th className="py-2 text-right">Total HT</th></>}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-2 pr-2">{l.description}{l.sku && <span className="block font-mono text-[10px] text-steel">{l.sku}</span>}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.quantity)}</td>
              {doc.showPrices && <><td className="py-2 text-right tabular-nums">{formatTND(l.unitPrice)}</td><td className="py-2 text-right">{Number(l.discountRate) ? `${Number(l.discountRate)} %` : ""}</td><td className="py-2 text-right">{Number(l.vatRate)} %</td><td className="py-2 text-right tabular-nums">{formatTND(t.lines[i].net)}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
      {doc.showPrices && (
        <div className="mt-6 flex justify-between gap-8">
          <table className="h-fit text-xs">
            <thead><tr className="text-steel"><th className="pr-4 text-left font-medium">Taux TVA</th><th className="pr-4 text-right font-medium">Base HT</th><th className="text-right font-medium">TVA</th></tr></thead>
            <tbody>{t.vatBreakdown.map((v) => <tr key={v.rate}><td className="pr-4">{v.rate} %</td><td className="pr-4 text-right tabular-nums">{formatTND(v.base)}</td><td className="text-right tabular-nums">{formatTND(v.vat)}</td></tr>)}</tbody>
          </table>
          <dl className="w-72 space-y-1">
            <div className="flex justify-between"><dt>Total brut HT</dt><dd className="tabular-nums">{formatTND(t.subtotal)}</dd></div>
            {t.discountTotal > 0 && <div className="flex justify-between"><dt>Remises</dt><dd className="tabular-nums">−{formatTND(t.discountTotal)}</dd></div>}
            {t.shipping > 0 && <div className="flex justify-between"><dt>Livraison HT</dt><dd className="tabular-nums">{formatTND(t.shipping)}</dd></div>}
            <div className="flex justify-between"><dt>Total TVA</dt><dd className="tabular-nums">{formatTND(t.vatTotal)}</dd></div>
            {t.stampDuty > 0 && <div className="flex justify-between"><dt>Droit de timbre</dt><dd className="tabular-nums">{formatTND(t.stampDuty)}</dd></div>}
            <div className="flex justify-between border-t-2 border-ink pt-1 text-sm font-bold"><dt>TOTAL TTC</dt><dd className="tabular-nums">{formatTND(doc.total)}</dd></div>
            {doc.paid && Number(doc.paid) > 0 && <div className="flex justify-between text-steel"><dt>Déjà réglé</dt><dd className="tabular-nums">{formatTND(doc.paid)}</dd></div>}
          </dl>
        </div>
      )}
      {doc.conditions && <div className="mt-8"><p className="text-[10px] font-semibold tracking-wider text-steel uppercase">Conditions</p><p className="mt-1 whitespace-pre-line text-xs">{doc.conditions}</p></div>}
      {doc.footer && <p className="mt-4 text-xs text-steel">{doc.footer}</p>}
      <div className="mt-12 border-t border-line pt-3 text-center text-[10px] text-steel">
        {s.company.bank && <p>Coordonnées bancaires : {s.company.bank}</p>}
        <p>{s.sales.invoiceFooter}</p>
      </div>
      <PrintButton />
    </div>
  );
}

export default function DocumentPage(props: PageProps<"/documents/[kind]/[id]">) {
  return (
    <main className="min-h-screen bg-mist py-8 print:bg-white print:py-0">
      <Suspense fallback={<p className="p-10 text-center text-sm text-steel">Chargement du document…</p>}>
        <DocumentView {...props} />
      </Suspense>
    </main>
  );
}
