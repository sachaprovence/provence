import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getOrder } from "@/lib/compta/order-service";
import { listProducts } from "@/lib/compta/product-service";
import { ComptaOrderPosClient } from "@/components/compta-order-pos-client";
import { formatEuros } from "@/lib/compta/money";
import { NotFoundError } from "@/lib/errors";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  TRANSFER: "Virement",
  MEAL_VOUCHER: "Ticket restaurant",
  CHEQUE: "Chèque",
  OTHER: "Autre",
};

export default async function ComptaOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  let order;
  try {
    order = await getOrder(actor.organization.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  if (order.status !== "OPEN") {
    return (
      <div className="space-y-6 max-w-xl">
        <Link href="/compta/commandes" className="text-sm text-p360-blue hover:underline">
          ← Commandes en cours
        </Link>
        <div className="card p-6 space-y-3">
          <h1 className="text-xl font-semibold text-p360-ink">{order.name?.trim() || `Commande #${order.number}`}</h1>
          <p className="text-sm text-p360-muted">
            {order.status === "COMPLETED" ? "Encaissée" : "Annulée"} — cette commande n&apos;est plus modifiable.
          </p>
          <ul className="divide-y divide-p360-lavender-light">
            {order.lines.map((line) => (
              <li key={line.id} className="py-2 flex items-center justify-between text-sm">
                <span>{line.productNameSnapshot} × {line.quantity}</span>
                <span className="text-p360-muted">{formatEuros(line.unitPriceTtcSnapshot * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between pt-2 border-t border-p360-lavender-light font-semibold text-p360-ink">
            <span>Total</span>
            <span>{formatEuros(order.totalAmount ?? order.computedTotal)}</span>
          </div>
          {order.paymentMethod && (
            <p className="text-sm text-p360-muted">Paiement : {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</p>
          )}
          {order.sale && (
            <p className="text-sm text-p360-muted">Vente liée : {order.sale.reference ?? order.sale.id}</p>
          )}
        </div>
      </div>
    );
  }

  const products = await listProducts(actor.organization.id);
  const categories = Array.from(new Set(products.map((p) => p.category))).sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <ComptaOrderPosClient
      order={{
        id: order.id,
        name: order.name,
        number: order.number,
        lines: order.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          productNameSnapshot: line.productNameSnapshot,
          quantity: line.quantity,
          unitPriceTtcSnapshot: line.unitPriceTtcSnapshot,
          vatRateSnapshot: line.vatRateSnapshot,
        })),
        computedSubtotal: order.computedSubtotal,
        computedVat: order.computedVat,
        computedTotal: order.computedTotal,
      }}
      products={products.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price, isFavorite: p.isFavorite }))}
      categories={categories}
    />
  );
}
