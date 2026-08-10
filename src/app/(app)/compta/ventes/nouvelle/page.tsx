import { requireActor } from "@/lib/auth";
import { listProducts } from "@/lib/compta/product-service";
import { listCustomers } from "@/lib/compta/customer-service";
import { getSale } from "@/lib/compta/sale-service";
import { ComptaSaleForm } from "@/components/compta-sale-form";

export default async function NewComptaSalePage({ searchParams }: { searchParams: Promise<{ duplicateFrom?: string }> }) {
  const actor = await requireActor();
  const { duplicateFrom } = await searchParams;
  const [products, customers, duplicate] = await Promise.all([
    listProducts(actor.organization.id),
    listCustomers(actor.organization.id),
    duplicateFrom ? getSale(actor.organization.id, duplicateFrom).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-p360-ink">{duplicate ? "Dupliquer une vente" : "Enregistrer une vente"}</h1>
      <ComptaSaleForm products={products} customers={customers} duplicateFrom={duplicate} />
    </div>
  );
}
