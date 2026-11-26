import Link from "next/link";
import { desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, orders, products, quotes, suppliers } from "@/db/schema";
import { Card, PageHeader, one } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/dal";

/** Recherche globale : uniquement dans les modules que l'utilisateur a le droit de consulter. */
export default async function SearchPage({ searchParams }: PageProps<"/admin/recherche">) {
  const me = await requireStaff();
  const q = one((await searchParams).q).trim().slice(0, 80);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const none = Promise.resolve([] as { href: string; title: string; sub: string }[]);
  const [p, c, o, d, f, s] = q.length < 2 ? [[], [], [], [], [], []] : await Promise.all([
    me.can("products.view") ? db.select({ id: products.id, sku: products.sku, name: products.name }).from(products).where(or(ilike(products.sku, like), ilike(products.name, like), ilike(products.manufacturerRef, like), sql`${products.barcode} = ${q}`)).limit(10).then((r) => r.map((x) => ({ href: `/admin/produits/${x.id}`, title: x.name, sub: x.sku }))) : none,
    me.can("customers.view") ? db.select({ id: customers.id, code: customers.code, company: customers.companyName, first: customers.firstName, last: customers.lastName, phone: customers.phone }).from(customers).where(or(ilike(customers.code, like), ilike(customers.companyName, like), ilike(customers.lastName, like), ilike(customers.firstName, like), ilike(customers.phone, like), ilike(customers.email, like), ilike(customers.taxId, like))).limit(10).then((r) => r.map((x) => ({ href: `/admin/clients/${x.id}`, title: x.company || [x.first, x.last].filter(Boolean).join(" "), sub: `${x.code} · ${x.phone ?? ""}` }))) : none,
    me.can("orders.view") ? db.select({ id: orders.id, number: orders.number, name: orders.shippingName }).from(orders).where(or(ilike(orders.number, like), ilike(orders.shippingName, like))).orderBy(desc(orders.createdAt)).limit(10).then((r) => r.map((x) => ({ href: `/admin/commandes/${x.id}`, title: x.number, sub: x.name ?? "" }))) : none,
    me.can("quotes.view") ? db.select({ id: quotes.id, number: quotes.number, name: quotes.contactName, company: quotes.companyName }).from(quotes).where(or(ilike(quotes.number, like), ilike(quotes.contactName, like), ilike(quotes.companyName, like))).orderBy(desc(quotes.createdAt)).limit(10).then((r) => r.map((x) => ({ href: `/admin/devis/${x.id}`, title: x.number, sub: x.company || x.name || "" }))) : none,
    me.can("invoices.view") ? db.select({ id: invoices.id, number: invoices.number, name: invoices.billingName }).from(invoices).where(or(ilike(invoices.number, like), ilike(invoices.billingName, like), ilike(invoices.externalRef, like))).orderBy(desc(invoices.createdAt)).limit(10).then((r) => r.map((x) => ({ href: `/admin/factures/${x.id}`, title: x.number, sub: x.name ?? "" }))) : none,
    me.can("suppliers.view") ? db.select({ id: suppliers.id, code: suppliers.code, name: suppliers.name }).from(suppliers).where(or(ilike(suppliers.name, like), ilike(suppliers.code, like))).limit(10).then((r) => r.map((x) => ({ href: `/admin/fournisseurs/${x.id}`, title: x.name, sub: x.code }))) : none,
  ]);
  const groups = [["Produits", p], ["Clients", c], ["Commandes", o], ["Devis", d], ["Factures", f], ["Fournisseurs", s]] as const;
  const total = groups.reduce((n, [, r]) => n + r.length, 0);
  return (
    <>
      <PageHeader title="Recherche" description={q ? `${total} résultat(s) pour « ${q} »` : "Saisissez au moins 2 caractères."} />
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.filter(([, r]) => r.length).map(([title, rows]) => (
          <Card key={title} title={title} padded={false}>
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.href}><Link href={r.href} className="block px-5 py-2.5 hover:bg-mist/60"><p className="text-sm font-medium">{r.title}</p><p className="font-mono text-xs text-steel">{r.sub}</p></Link></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
