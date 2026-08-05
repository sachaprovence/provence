import { requireActor } from "@/lib/auth";
import { listSuppliers } from "@/lib/compta/supplier-service";
import { ComptaExpenseForm } from "@/components/compta-expense-form";

export default async function NewComptaExpensePage() {
  const actor = await requireActor();
  const suppliers = await listSuppliers(actor.organization.id);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-p360-ink">Ajouter une dépense</h1>
      <ComptaExpenseForm suppliers={suppliers} />
    </div>
  );
}
