import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { listOpenOrders } from "@/lib/compta/order-service";
import { ComptaOrdersClient } from "@/components/compta-orders-client";

export default async function ComptaOrdersPage() {
  const actor = await requireActor();
  const orders = await listOpenOrders(actor.organization.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-p360-ink">Commandes</h1>
          <p className="text-p360-muted text-sm mt-1">Table, client à emporter, livraison — prenez la commande, puis encaissez quand elle est prête.</p>
        </div>
        <Link href="/compta/commandes/historique" className="text-sm text-p360-blue hover:underline">
          Historique →
        </Link>
      </div>
      <ComptaOrdersClient
        initialOrders={orders.map((o) => ({
          id: o.id,
          name: o.name,
          number: o.number,
          createdAt: o.createdAt.toISOString(),
          computedTotal: o.computedTotal,
          lineCount: o.lines.length,
        }))}
      />
    </div>
  );
}
