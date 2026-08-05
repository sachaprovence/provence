import { requireActor } from "@/lib/auth";
import { listProducts } from "@/lib/compta/product-service";
import { ComptaProductsClient } from "@/components/compta-products-client";

export default async function ComptaProductsPage() {
  const actor = await requireActor();
  const products = await listProducts(actor.organization.id, { includeInactive: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Produits</h1>
      <ComptaProductsClient products={products} />
    </div>
  );
}
