import { requireActor } from "@/lib/auth";
import { listProducts } from "@/lib/compta/product-service";
import { ComptaSaleForm } from "@/components/compta-sale-form";

export default async function NewComptaSalePage() {
  const actor = await requireActor();
  const products = await listProducts(actor.organization.id);

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-p360-ink">Enregistrer une vente</h1>
      <ComptaSaleForm products={products} />
    </div>
  );
}
