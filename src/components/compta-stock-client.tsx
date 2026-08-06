"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number | null;
  unitCost: number | null;
};

const EMPTY_FORM = { name: "", unit: "kg", stockQuantity: "0", lowStockThreshold: "", unitCost: "" };

export function ComptaStockClient({ ingredients }: { ingredients: Ingredient[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/compta/ingredients", {
        name: form.name,
        unit: form.unit,
        stockQuantity: Number(form.stockQuantity) || 0,
        lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : undefined,
        unitCost: form.unitCost ? Math.round(Number(form.unitCost) * 100) : undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection(ingredientId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/compta/ingredients/${ingredientId}/correct`, {
        newQuantity: Number(correctionValue),
        reason: correctionReason || "Inventaire",
      });
      setCorrecting(null);
      setCorrectionValue("");
      setCorrectionReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Annuler" : "Nouvel ingrédient"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Nom</label>
            <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Unité</label>
            <input required className="input" placeholder="kg, L, unité…" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          </div>
          <div>
            <label className="label">Stock initial</label>
            <input type="number" min="0" step="0.01" className="input" value={form.stockQuantity} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} />
          </div>
          <div>
            <label className="label">Seuil d&apos;alerte (optionnel)</label>
            <input type="number" min="0" step="0.01" className="input" value={form.lowStockThreshold} onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} />
          </div>
          <div>
            <label className="label">Coût unitaire (€, optionnel)</label>
            <input type="number" min="0" step="0.01" className="input" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-p360-danger col-span-full">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-fit col-span-full">{busy ? "Ajout…" : "Ajouter l'ingrédient"}</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        {error && !showForm && <div className="p-3 text-sm text-p360-danger">{error}</div>}
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Ingrédient</th>
              <th className="text-left px-4 py-2">Stock</th>
              <th className="text-left px-4 py-2">Seuil d&apos;alerte</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ingredient) => {
              const low = ingredient.lowStockThreshold !== null && ingredient.stockQuantity <= ingredient.lowStockThreshold;
              return (
                <tr key={ingredient.id} className="border-t border-p360-lavender-light">
                  <td className="px-4 py-2 text-p360-ink">{ingredient.name}</td>
                  <td className={`px-4 py-2 tabular-nums font-medium ${low ? "text-p360-danger" : "text-p360-ink"}`}>
                    {ingredient.stockQuantity} {ingredient.unit} {low && "⚠"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-p360-muted">
                    {ingredient.lowStockThreshold !== null ? `${ingredient.lowStockThreshold} ${ingredient.unit}` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {correcting === ingredient.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          className="input w-24"
                          placeholder="Stock réel"
                          value={correctionValue}
                          onChange={(e) => setCorrectionValue(e.target.value)}
                        />
                        <input
                          className="input w-40"
                          placeholder="Motif"
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                        />
                        <button className="text-xs text-p360-success hover:underline" disabled={busy} onClick={() => submitCorrection(ingredient.id)}>
                          Valider
                        </button>
                        <button className="text-xs text-p360-muted hover:underline" onClick={() => setCorrecting(null)}>
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-xs text-p360-blue hover:underline"
                        onClick={() => {
                          setCorrecting(ingredient.id);
                          setCorrectionValue(String(ingredient.stockQuantity));
                        }}
                      >
                        Corriger (inventaire)
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {ingredients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-p360-muted">Aucun ingrédient. Ajoutez-les pour suivre le stock et créer des recettes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
