import { requireActor } from "@/lib/auth";
import { listPurchaseOrders } from "@/lib/compta/purchase-service";
import { listSuppliers } from "@/lib/compta/supplier-service";
import { listIngredients } from "@/lib/compta/stock-service";
import { ComptaPurchaseOrdersClient } from "@/components/compta-purchase-orders-client";

export default async function ComptaPurchaseOrdersPage() {
  const actor = await requireActor();
  const [purchaseOrders, suppliers, ingredients] = await Promise.all([
    listPurchaseOrders(actor.organization.id),
    listSuppliers(actor.organization.id),
    listIngredients(actor.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Achats</h1>
      <ComptaPurchaseOrdersClient purchaseOrders={purchaseOrders} suppliers={suppliers} ingredients={ingredients} />
    </div>
  );
}
