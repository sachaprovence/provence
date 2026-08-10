"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui";
import { formatEuros } from "@/lib/compta/money";

type OrderSummary = {
  id: string;
  name: string | null;
  number: number;
  createdAt: string;
  computedTotal: number;
  lineCount: number;
};

function orderLabel(order: OrderSummary) {
  return order.name?.trim() ? order.name : `Commande #${order.number}`;
}

function ageLabel(createdAt: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

export function ComptaOrdersClient({ initialOrders }: { initialOrders: OrderSummary[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Rafraîchit l'âge affiché ("2 min", "1 h 05"...) sans recharger la page ni interroger le serveur.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function createOrder() {
    setCreating(true);
    try {
      const { order } = await apiPost<{ order: { id: string } }>("/api/compta/orders", { name: name.trim() || undefined });
      setName("");
      router.push(`/compta/commandes/${order.id}`);
    } catch (err) {
      push({ title: "Erreur", description: err instanceof ApiError ? err.message : "Impossible de créer la commande.", variant: "error" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
        <div className="flex-1">
          <label className="label">Nom (facultatif)</label>
          <input
            className="input"
            placeholder="Table 3, Monsieur Dupont, à emporter…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createOrder()}
          />
        </div>
        <button type="button" className="btn-primary whitespace-nowrap" disabled={creating} onClick={createOrder}>
          {creating ? "Création…" : "+ Nouvelle commande"}
        </button>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-p360-muted mb-3">Commandes en cours</h2>
        {initialOrders.length === 0 ? (
          <div className="card p-6 text-center text-p360-muted">Aucune commande en cours. Créez-en une ci-dessus pour commencer.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {initialOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => router.push(`/compta/commandes/${order.id}`)}
                className="card p-4 text-left hover:bg-p360-lavender-light/40 active:scale-[0.98] transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold text-p360-ink">{orderLabel(order)}</div>
                  <span className="text-xs text-p360-muted whitespace-nowrap">{ageLabel(order.createdAt, now)}</span>
                </div>
                <div className="text-sm text-p360-muted mt-1">
                  {order.lineCount} article{order.lineCount > 1 ? "s" : ""}
                </div>
                <div className="text-lg font-semibold text-p360-ink mt-2">{formatEuros(order.computedTotal)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
