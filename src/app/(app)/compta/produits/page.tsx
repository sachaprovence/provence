import { requireActor } from "@/lib/auth";
import { listProducts } from "@/lib/compta/product-service";
import { listVatRates } from "@/lib/compta/vat-rate-service";
import { ComptaProductsClient } from "@/components/compta-products-client";

export default async function ComptaProductsPage() {
  const actor = await requireActor();
  const [products, vatRates] = await Promise.all([
    listProducts(actor.organization.id, { includeInactive: true }),
    listVatRates(actor.organization.id, { activeOnly: true }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Produits</h1>
      <ComptaProductsClient products={products} vatRates={vatRates.map((r) => ({ id: r.id, name: r.name, rate: r.rate }))} />
    </div>
  );
}
