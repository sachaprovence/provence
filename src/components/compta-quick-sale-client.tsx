"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui";
import { formatEuros } from "@/lib/compta/money";

type Product = { id: string; name: string; price: number; category: string };

export function ComptaQuickSaleClient({ tiles, allProducts }: { tiles: Product[]; allProducts: Product[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function sell(product: Product) {
    setBusyId(product.id);
    try {
      await apiPost("/api/compta/sales/quick", { productId: product.id });
      push({ title: "Vente enregistrée", description: `${product.name} — ${formatEuros(product.price)}`, variant: "success", durationMs: 3000 });
      router.refresh();
    } catch (err) {
      push({ title: "Erreur", description: err instanceof ApiError ? err.message : "La vente n'a pas pu être enregistrée.", variant: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const filtered = search.trim()
    ? allProducts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {tiles.map((product) => (
          <button
            key={product.id}
            disabled={busyId !== null}
            onClick={() => sell(product)}
            className="card p-5 text-left hover:bg-p360-lavender-light/40 active:scale-[0.98] transition disabled:opacity-50 min-h-[96px]"
          >
            <div className="text-base font-semibold text-p360-ink">{busyId === product.id ? "…" : product.name}</div>
            <div className="text-sm text-p360-muted mt-1">{formatEuros(product.price)}</div>
          </button>
        ))}
        {tiles.length === 0 && (
          <div className="col-span-full text-center text-p360-muted py-8">
            Aucun favori pour l&apos;instant. Marquez vos produits favoris depuis « Produits », ou cherchez ci-dessous.
          </div>
        )}
      </div>

      <div className="card p-4">
        <label className="label">Autre produit</label>
        <input
          className="input"
          placeholder="Rechercher un produit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filtered.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filtered.slice(0, 9).map((product) => (
              <button
                key={product.id}
                disabled={busyId !== null}
                onClick={() => sell(product)}
                className="btn-secondary text-left justify-start disabled:opacity-50"
              >
                {product.name} — {formatEuros(product.price)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
