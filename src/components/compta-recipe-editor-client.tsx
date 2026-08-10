"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPut, apiDelete, ApiError } from "@/lib/api-client";

type Ingredient = { id: string; name: string; unit: string };
type RecipeLine = { ingredientId: string; quantity: number };

export function ComptaRecipeEditorClient({
  productId,
  productName,
  initialLines,
  ingredients,
}: {
  productId: string;
  productName: string;
  initialLines: RecipeLine[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const hasRecipe = initialLines.length > 0;
  const [lines, setLines] = useState<RecipeLine[]>(initialLines.length > 0 ? initialLines : [{ ingredientId: "", quantity: 1 }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateLine(index: number, patch: Partial<RecipeLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function ingredientUnit(ingredientId: string) {
    return ingredients.find((i) => i.id === ingredientId)?.unit ?? "";
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const validLines = lines.filter((l) => l.ingredientId && l.quantity > 0);
      await apiPut(`/api/compta/products/${productId}/recipe`, { lines: validLines });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecipe() {
    if (!confirm(`Supprimer la recette de ${productName} ?`)) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await apiDelete(`/api/compta/products/${productId}/recipe`);
      setLines([{ ingredientId: "", quantity: 1 }]);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de supprimer cette recette. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (ingredients.length === 0) {
    return (
      <div className="card p-4 text-sm text-p360-muted">
        Aucun ingrédient enregistré. Ajoutez d&apos;abord vos ingrédients depuis « Stock ».
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hasRecipe && (
        <div className="card p-4 text-sm text-p360-muted">
          Aucune recette configurée pour ce produit — le stock des ingrédients ne sera pas décrémenté à la vente
          tant qu&apos;aucune ligne n&apos;est enregistrée ci-dessous.
        </div>
      )}
      <div className="card p-4 space-y-3">
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-7">
            <label className="label">Ingrédient</label>
            <select className="input" value={line.ingredientId} onChange={(e) => updateLine(index, { ingredientId: e.target.value })}>
              <option value="">—</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-4">
            <label className="label">Quantité ({ingredientUnit(line.ingredientId) || "unité"})</label>
            <input
              type="number"
              min="0"
              step="0.001"
              className="input"
              value={line.quantity}
              onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-1">
            <button type="button" className="btn-ghost w-full" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => setLines((current) => [...current, { ingredientId: "", quantity: 1 }])}>
        + Ajouter un ingrédient
      </button>

      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {saved && <p className="text-sm text-p360-success">Recette enregistrée.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="btn-primary" onClick={save}>
          {busy ? "Enregistrement…" : "Enregistrer la recette"}
        </button>
        {hasRecipe && (
          <button type="button" disabled={busy} className="btn-danger" onClick={deleteRecipe}>
            Supprimer la recette
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
