"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  TRANSFER: "Virement",
  OTHER: "Autre",
};

type Sale = {
  id: string;
  soldAt: string | Date;
  paymentMethod: string;
  totalAmount: number;
  vatAmount: number;
  lines: { id: string; productName: string; quantity: number }[];
};

export function ComptaSalesClient({ sales }: { sales: Sale[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Supprimer cette vente ?")) return;
    setBusy(id);
    setError(null);
    try {
      await apiDelete(`/api/compta/sales/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-x-auto">
      {error && <div className="p-3 text-sm text-p360-danger">{error}</div>}
      <table className="w-full text-sm">
        <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Date</th>
            <th className="text-left px-4 py-2">Produits</th>
            <th className="text-left px-4 py-2">Paiement</th>
            <th className="text-left px-4 py-2">TVA</th>
            <th className="text-left px-4 py-2">Total TTC</th>
            <th className="text-left px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-t border-p360-lavender-light">
              <td className="px-4 py-2 text-p360-muted">
                {new Date(sale.soldAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </td>
              <td className="px-4 py-2 text-p360-ink">
                {sale.lines.map((l) => `${l.quantity}× ${l.productName}`).join(", ")}
              </td>
              <td className="px-4 py-2">
                <span className="badge bg-p360-lavender-light text-p360-blue">{PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</span>
              </td>
              <td className="px-4 py-2 tabular-nums text-p360-muted">{formatEuros(sale.vatAmount)}</td>
              <td className="px-4 py-2 tabular-nums text-p360-ink font-medium">{formatEuros(sale.totalAmount)}</td>
              <td className="px-4 py-2">
                <button className="text-xs text-p360-danger hover:underline" disabled={busy === sale.id} onClick={() => remove(sale.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
          {sales.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-p360-muted">Aucune vente enregistrée.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
