"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

const CATEGORY_LABEL: Record<string, string> = {
  INGREDIENTS: "Matières premières",
  RENT: "Loyer",
  UTILITIES: "Charges (eau/élec/gaz)",
  SALARIES: "Salaires",
  EQUIPMENT: "Équipement",
  MARKETING: "Marketing",
  TAXES: "Impôts et taxes",
  OTHER: "Autre",
};

type Expense = {
  id: string;
  spentAt: string | Date;
  amount: number;
  vatAmount: number;
  category: string;
  description: string;
  supplier: { id: string; name: string } | null;
};

export function ComptaExpensesClient({ expenses }: { expenses: Expense[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Supprimer cette dépense ?")) return;
    setBusy(id);
    setError(null);
    try {
      await apiDelete(`/api/compta/expenses/${id}`);
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
            <th className="text-left px-4 py-2">Description</th>
            <th className="text-left px-4 py-2">Catégorie</th>
            <th className="text-left px-4 py-2">Fournisseur</th>
            <th className="text-left px-4 py-2">TVA récupérable</th>
            <th className="text-left px-4 py-2">Montant TTC</th>
            <th className="text-left px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id} className="border-t border-p360-lavender-light">
              <td className="px-4 py-2 text-p360-muted">{new Date(expense.spentAt).toLocaleDateString("fr-FR")}</td>
              <td className="px-4 py-2 text-p360-ink">{expense.description}</td>
              <td className="px-4 py-2"><span className="badge bg-p360-lavender-light text-p360-blue">{CATEGORY_LABEL[expense.category] ?? expense.category}</span></td>
              <td className="px-4 py-2 text-p360-muted">{expense.supplier?.name ?? "—"}</td>
              <td className="px-4 py-2 tabular-nums text-p360-muted">{formatEuros(expense.vatAmount)}</td>
              <td className="px-4 py-2 tabular-nums text-p360-ink font-medium">{formatEuros(expense.amount)}</td>
              <td className="px-4 py-2">
                <button className="text-xs text-p360-danger hover:underline" disabled={busy === expense.id} onClick={() => remove(expense.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
          {expenses.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-p360-muted">Aucune dépense enregistrée.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
