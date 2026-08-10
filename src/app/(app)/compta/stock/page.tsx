import { requireActor } from "@/lib/auth";
import { listIngredients } from "@/lib/compta/stock-service";
import { ComptaStockClient } from "@/components/compta-stock-client";

export default async function ComptaStockPage() {
  const actor = await requireActor();
  const ingredients = await listIngredients(actor.organization.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Stock</h1>
      <ComptaStockClient ingredients={ingredients} />
    </div>
  );
}
