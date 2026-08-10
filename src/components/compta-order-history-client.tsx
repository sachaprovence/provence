"use client";

import { useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

type OrderHistoryEntry = {
  id: string;
  name: string | null;
  number: number;
  status: "COMPLETED" | "CANCELLED";
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  totalAmount: number | null;
  lineCount: number;
  saleReference: string | null;
};

type Filter = "today" | "completed" | "cancelled" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "completed", label: "Terminées" },
  { key: "cancelled", label: "Annulées" },
  { key: "all", label: "Toutes" },
];

const STATUS_LABEL: Record<string, string> = { COMPLETED: "Encaissée", CANCELLED: "Annulée" };

function orderDisplayName(order: { name: string | null; number: number }) {
  return order.name?.trim() ? order.name : `Commande #${order.number}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ComptaOrderHistoryClient({ initialOrders, initialFilter }: { initialOrders: OrderHistoryEntry[]; initialFilter: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [orders, setOrders] = useState(initialOrders);
  const [loading, setLoading] = useState(false);

  async function applyFilter(next: Filter) {
    setFilter(next);
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: "history" });
      if (next === "completed") params.set("status", "COMPLETED");
      if (next === "cancelled") params.set("status", "CANCELLED");
      if (next === "today") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        params.set("from", start.toISOString());
      }
      const res = await apiGet<{ orders: OrderHistoryEntry[] }>(`/api/compta/orders?${params.toString()}`);
      setOrders(res.orders);
    } catch {
      // best-effort : en cas d'erreur, on garde la liste précédemment affichée.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => applyFilter(f.key)}
            className={filter === f.key ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-p360-muted">Chargement…</p>
      ) : orders.length === 0 ? (
        <div className="card p-6 text-center text-p360-muted">Aucune commande sur cette période.</div>
      ) : (
        <div className="card divide-y divide-p360-lavender-light overflow-hidden">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/compta/commandes/${order.id}`}
              className="flex items-center justify-between gap-3 p-4 hover:bg-p360-lavender-light/40 transition"
            >
              <div className="min-w-0">
                <div className="font-medium text-p360-ink truncate">{orderDisplayName(order)}</div>
                <div className="text-xs text-p360-muted">
                  {formatDate(order.completedAt ?? order.cancelledAt ?? order.createdAt)} · {order.lineCount} article{order.lineCount > 1 ? "s" : ""}
                  {order.saleReference ? ` · ${order.saleReference}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-none">
                <span className={`badge ${order.status === "CANCELLED" ? "bg-p360-danger-light text-p360-danger" : "bg-p360-lavender-light text-p360-blue"}`}>
                  {STATUS_LABEL[order.status]}
                </span>
                <span className="font-semibold text-p360-ink tabular-nums w-20 text-right">
                  {order.totalAmount !== null ? formatEuros(order.totalAmount) : "—"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
