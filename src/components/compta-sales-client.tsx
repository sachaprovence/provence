"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete, apiPost, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  TRANSFER: "Virement",
  MEAL_VOUCHER: "Ticket restaurant",
  CHEQUE: "Chèque",
  OTHER: "Autre",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Validée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursement",
};

type Sale = {
  id: string;
  reference: string | null;
  status: string;
  soldAt: string | Date;
  paymentMethod: string;
  totalAmount: number;
  vatAmount: number;
  customer: { id: string; name: string } | null;
  lines: { id: string; productName: string; quantity: number }[];
};

export function ComptaSalesClient({ initialSales, canDelete }: { initialSales: Sale[]; canDelete: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Sale[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sales = search.trim() && searchResults ? searchResults : initialSales;

  function handleSearchChange(value: string) {
    setSearch(value);
    if (!value.trim()) setSearchResults(null);
  }

  useEffect(() => {
    if (!search.trim()) return;
    const handle = setTimeout(async () => {
      try {
        const res = await apiGet<{ sales: Sale[] }>(`/api/compta/sales?search=${encodeURIComponent(search)}`);
        setSearchResults(res.sales);
      } catch {
        // recherche best-effort : en cas d'erreur réseau, on garde la liste précédente affichée.
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function remove(id: string) {
    if (!confirm("Supprimer définitivement cette vente ?")) return;
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

  async function cancel(id: string) {
    if (!confirm("Annuler cette vente ?")) return;
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/api/compta/sales/${id}/cancel`, {});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function refund(id: string) {
    if (!confirm("Rembourser intégralement cette vente ?")) return;
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/api/compta/sales/${id}/refund`, {});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <input
        className="input max-w-sm"
        placeholder="Rechercher (référence, client, produit)…"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
      />
      <div className="card overflow-x-auto">
        {error && <div className="p-3 text-sm text-p360-danger">{error}</div>}
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Référence</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Produits</th>
              <th className="text-left px-4 py-2">Client</th>
              <th className="text-left px-4 py-2">Paiement</th>
              <th className="text-left px-4 py-2">Statut</th>
              <th className="text-left px-4 py-2">Total TTC</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-muted">{sale.reference ?? "—"}</td>
                <td className="px-4 py-2 text-p360-muted">
                  {new Date(sale.soldAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2 text-p360-ink">
                  {sale.lines.map((l) => `${l.quantity}× ${l.productName}`).join(", ")}
                </td>
                <td className="px-4 py-2 text-p360-muted">{sale.customer?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className="badge bg-p360-lavender-light text-p360-blue">{PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</span>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`badge ${
                      sale.status === "CANCELLED"
                        ? "bg-p360-danger-light text-p360-danger"
                        : sale.status === "REFUNDED"
                          ? "bg-p360-sand-light text-p360-warning"
                          : "bg-p360-lavender-light text-p360-blue"
                    }`}
                  >
                    {STATUS_LABEL[sale.status] ?? sale.status}
                  </span>
                </td>
                <td className={`px-4 py-2 tabular-nums font-medium ${sale.totalAmount < 0 ? "text-p360-danger" : "text-p360-ink"}`}>
                  {formatEuros(sale.totalAmount)}
                </td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  <Link href={`/compta/ventes/nouvelle?duplicateFrom=${sale.id}`} className="text-xs text-p360-blue hover:underline">
                    Dupliquer
                  </Link>
                  {sale.status === "COMPLETED" && (
                    <>
                      <button className="text-xs text-p360-warning hover:underline" disabled={busy === sale.id} onClick={() => cancel(sale.id)}>
                        Annuler
                      </button>
                      <button className="text-xs text-p360-danger hover:underline" disabled={busy === sale.id} onClick={() => refund(sale.id)}>
                        Rembourser
                      </button>
                    </>
                  )}
                  {canDelete && (
                    <button className="text-xs text-p360-muted hover:underline" disabled={busy === sale.id} onClick={() => remove(sale.id)}>
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-p360-muted">Aucune vente trouvée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
