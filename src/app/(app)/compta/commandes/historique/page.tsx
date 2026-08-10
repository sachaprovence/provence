import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { listOrderHistory } from "@/lib/compta/order-service";
import { ComptaOrderHistoryClient } from "@/components/compta-order-history-client";

export default async function ComptaOrderHistoryPage() {
  const actor = await requireActor();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const orders = await listOrderHistory(actor.organization.id, { from: startOfDay });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-p360-ink">Historique des commandes</h1>
          <p className="text-p360-muted text-sm mt-1">Commandes encaissées ou annulées.</p>
        </div>
        <Link href="/compta/commandes" className="text-sm text-p360-blue hover:underline">
          ← Commandes en cours
        </Link>
      </div>
      <ComptaOrderHistoryClient
        initialOrders={orders.map((o) => ({
          id: o.id,
          name: o.name,
          number: o.number,
          status: o.status as "COMPLETED" | "CANCELLED",
          createdAt: o.createdAt.toISOString(),
          completedAt: o.completedAt ? o.completedAt.toISOString() : null,
          cancelledAt: o.cancelledAt ? o.cancelledAt.toISOString() : null,
          totalAmount: o.totalAmount,
          lineCount: o.lines.length,
          saleReference: o.sale?.reference ?? null,
        }))}
        initialFilter="today"
      />
    </div>
  );
}
