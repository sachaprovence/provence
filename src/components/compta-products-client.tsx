"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, apiPatch, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  vatRate: number;
  costPrice: number | null;
  isActive: boolean;
  isFavorite: boolean;
};

const EMPTY_FORM = { name: "", category: "", price: "", vatRate: "10", costPrice: "", isFavorite: false };

export function ComptaProductsClient({ products }: { products: Product[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/compta/products", {
        name: form.name,
        category: form.category,
        price: Math.round(Number(form.price) * 100),
        vatRate: Number(form.vatRate),
        costPrice: form.costPrice ? Math.round(Number(form.costPrice) * 100) : undefined,
        isFavorite: form.isFavorite,
        aliases: [],
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

  async function toggleActive(product: Product) {
    setBusy(true);
    try {
      await apiPatch(`/api/compta/products/${product.id}`, { isActive: !product.isActive });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(product: Product) {
    setBusy(true);
    try {
      await apiPatch(`/api/compta/products/${product.id}`, { isFavorite: !product.isFavorite });
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
          {showForm ? "Annuler" : "Nouveau produit"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Nom</label>
            <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Catégorie</label>
            <input required className="input" placeholder="Pizza, Boisson…" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </div>
          <div>
            <label className="label">Prix TTC (€)</label>
            <input required type="number" step="0.01" min="0" className="input" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          </div>
          <div>
            <label className="label">TVA (%)</label>
            <input required type="number" step="0.1" min="0" max="100" className="input" value={form.vatRate} onChange={(e) => setForm((f) => ({ ...f, vatRate: e.target.value }))} />
          </div>
          <div>
            <label className="label">Coût matière (€, optionnel)</label>
            <input type="number" step="0.01" min="0" className="input" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-p360-ink">
              <input type="checkbox" checked={form.isFavorite} onChange={(e) => setForm((f) => ({ ...f, isFavorite: e.target.checked }))} />
              Favori (vente rapide)
            </label>
          </div>
          {error && <p className="text-sm text-p360-danger col-span-full">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-fit col-span-full">{busy ? "Ajout…" : "Ajouter le produit"}</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Catégorie</th>
              <th className="text-left px-4 py-2">Prix TTC</th>
              <th className="text-left px-4 py-2">TVA</th>
              <th className="text-left px-4 py-2">Marge estimée</th>
              <th className="text-left px-4 py-2">Statut</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">
                  {product.isFavorite && <span title="Favori">⭐ </span>}
                  {product.name}
                </td>
                <td className="px-4 py-2 text-p360-muted">{product.category}</td>
                <td className="px-4 py-2 tabular-nums">{formatEuros(product.price)}</td>
                <td className="px-4 py-2 tabular-nums">{product.vatRate} %</td>
                <td className="px-4 py-2 tabular-nums">{product.costPrice !== null ? formatEuros(product.price - product.costPrice) : "—"}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${product.isActive ? "bg-p360-lavender-light text-p360-blue" : "bg-p360-danger-light text-p360-danger"}`}>
                    {product.isActive ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  <button className="text-xs text-p360-blue hover:underline" disabled={busy} onClick={() => toggleFavorite(product)}>
                    {product.isFavorite ? "Retirer des favoris" : "Mettre en favori"}
                  </button>
                  <Link href={`/compta/produits/${product.id}/recette`} className="text-xs text-p360-blue hover:underline">
                    Recette
                  </Link>
                  <button className="text-xs text-p360-muted hover:underline" disabled={busy} onClick={() => toggleActive(product)}>
                    {product.isActive ? "Désactiver" : "Activer"}
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-p360-muted">Aucun produit. Ajoutez votre carte pour commencer à enregistrer des ventes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
