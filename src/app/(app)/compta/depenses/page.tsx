import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { listExpenses } from "@/lib/compta/expense-service";
import { ComptaExpensesClient } from "@/components/compta-expenses-client";

export default async function ComptaExpensesPage() {
  const actor = await requireActor();
  const expenses = await listExpenses(actor.organization.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-p360-ink">Dépenses</h1>
        <Link href="/compta/depenses/nouvelle" className="btn-primary">Ajouter une dépense</Link>
      </div>
      <ComptaExpensesClient expenses={expenses} />
    </div>
  );
}
