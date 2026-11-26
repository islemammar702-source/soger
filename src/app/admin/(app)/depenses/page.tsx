import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenses, users } from "@/db/schema";
import { Card, EmptyRow, Flash, PageHeader, StatCard, Table, Td, Th } from "@/components/admin/ui";
import { SubmitButton } from "@/components/ui/form";
import { PAYMENT_METHOD, formatDate } from "@/lib/labels";
import { formatTND } from "@/lib/utils";
import { addExpenseAction, deleteExpenseAction } from "@/server/admin/pos";
import { requireStaff } from "@/server/auth/dal";

const CATEGORIES = ["Loyer", "Électricité / eau", "Transport", "Carburant", "Salaires", "Fournitures de bureau", "Entretien", "Télécom", "Impôts et taxes", "Divers"];

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/depenses">) {
  const me = await requireStaff("expenses.view");
  const sp = await searchParams;
  const [rows, [m]] = await Promise.all([
    db.select({ e: expenses, user: users.name }).from(expenses).leftJoin(users, eq(users.id, expenses.createdBy)).orderBy(desc(expenses.paidAt)).limit(200),
    db.select({ month: sql<string>`coalesce(sum(amount) filter (where date_trunc('month', paid_at) = date_trunc('month', now())), 0)`, year: sql<string>`coalesce(sum(amount) filter (where date_trunc('year', paid_at) = date_trunc('year', now())), 0)` }).from(expenses),
  ]);
  return (
    <>
      <PageHeader title="Dépenses" description="Charges courantes. Une dépense payée en espèces depuis la caisse est déduite des espèces attendues à la clôture." />
      <Flash sp={sp} />
      <div className="mb-4 grid gap-4 sm:grid-cols-2"><StatCard label="Dépenses du mois" value={formatTND(m.month)} /><StatCard label="Dépenses de l'année" value={formatTND(m.year)} /></div>
      {me.can("expenses.create") && (
        <Card title="Nouvelle dépense" className="mb-6">
          <form action={addExpenseAction} className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
            <select name="category" className="h-10 rounded-lg border border-line px-2">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <input name="description" required placeholder="Description" className="h-10 rounded-lg border border-line px-3 lg:col-span-2" />
            <input name="amount" required placeholder="Montant TTC" inputMode="decimal" className="h-10 rounded-lg border border-line px-3" />
            <input name="vatAmount" placeholder="dont TVA" inputMode="decimal" className="h-10 rounded-lg border border-line px-3" />
            <input name="paidAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="h-10 rounded-lg border border-line px-3" />
            <select name="method" className="h-10 rounded-lg border border-line px-2">{["cash", "card", "transfer", "check", "other"].map((k) => <option key={k} value={k}>{PAYMENT_METHOD[k]}</option>)}</select>
            <label className="flex items-center gap-2 lg:col-span-3"><input type="checkbox" name="fromRegister" /> Payée avec les espèces de la caisse ouverte</label>
            <SubmitButton variant="dark" className="lg:col-span-2">Enregistrer</SubmitButton>
          </form>
        </Card>
      )}
      <Card padded={false}>
        <Table>
          <thead><tr><Th>Date</Th><Th>Catégorie</Th><Th>Description</Th><Th>Mode</Th><Th>Saisie par</Th><Th className="text-right">Montant</Th><Th /></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>Aucune dépense.</EmptyRow>}
            {rows.map(({ e, user }) => (
              <tr key={e.id}>
                <Td className="text-steel">{formatDate(e.paidAt)}</Td><Td>{e.category}</Td><Td>{e.description}</Td><Td>{PAYMENT_METHOD[e.method]}{e.cashSessionId ? " (caisse)" : ""}</Td><Td className="text-xs text-steel">{user}</Td>
                <Td className="text-right font-semibold tabular-nums">{formatTND(e.amount)}</Td>
                <Td>{me.can("expenses.delete") && <form action={deleteExpenseAction}><input type="hidden" name="id" value={e.id} /><button className="text-xs text-danger">Supprimer</button></form>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

/** Back-office : données toujours lues à la requête (stock, paiements…) ; la navigation peut attendre le serveur, un écran de chargement s’affiche. */
export const instant = false;
