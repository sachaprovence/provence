"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

type Product = { id: string; name: string; price: number; vatRate: number };

type Line = { productId: string; productName: string; quantity: number; unitPrice: number; vatRate: number };

function nowLocalDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function emptyLine(): Line {
  return { productId: "", productName: "", quantity: 1, unitPrice: 0, vatRate: 10 };
}

export function ComptaSaleForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const [soldAt, setSoldAt] = useState(nowLocalDatetime());
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      updateLine(index, { productId: "", productName: "" });
      return;
    }
    updateLine(index, { productId: product.id, productName: product.name, unitPrice: product.price, vatRate: product.vatRate });
  }

  const discount = Number(discountPercent) || 0;
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const total = Math.round(subtotal * (1 - discount / 100));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/compta/sales", {
        soldAt: new Date(soldAt).toISOString(),
        paymentMethod,
        discountPercent: discount,
        notes: notes || undefined,
        lines: lines
          .filter((l) => l.productName && l.quantity > 0)
          .map((l) => ({
            productId: l.productId || undefined,
            productName: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
          })),
      });
      router.push("/compta/ventes");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="label">Date et heure</label>
          <input required type="datetime-local" className="input" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
        </div>
        <div>
          <label className="label">Mode de paiement</label>
          <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="CASH">Espèces</option>
            <option value="CARD">Carte</option>
            <option value="TRANSFER">Virement</option>
            <option value="OTHER">Autre</option>
          </select>
        </div>
        <div>
          <label className="label">Remise (%)</label>
          <input type="number" min="0" max="100" step="0.1" className="input" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-p360-ink">Produits</h2>
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-5">
              <label className="label">Produit</label>
              <select
                className="input"
                value={line.productId}
                onChange={(e) => selectProduct(index, e.target.value)}
              >
                <option value="">— Libre —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {!line.productId && (
                <input
                  className="input mt-1"
                  placeholder="Nom du produit"
                  value={line.productName}
                  onChange={(e) => updateLine(index, { productName: e.target.value })}
                />
              )}
            </div>
            <div className="col-span-2">
              <label className="label">Qté</label>
              <input type="number" min="1" className="input" value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <label className="label">PU TTC (€)</label>
              <input type="number" min="0" step="0.01" className="input" value={line.unitPrice / 100} onChange={(e) => updateLine(index, { unitPrice: Math.round(Number(e.target.value) * 100) })} />
            </div>
            <div className="col-span-2">
              <label className="label">TVA (%)</label>
              <input type="number" min="0" max="100" step="0.1" className="input" value={line.vatRate} onChange={(e) => updateLine(index, { vatRate: Number(e.target.value) })} />
            </div>
            <div className="col-span-1">
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>
          + Ajouter une ligne
        </button>
      </div>

      <div>
        <label className="label">Notes (optionnel)</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="card p-4 flex items-center justify-between">
        <span className="text-p360-muted text-sm">Total TTC</span>
        <span className="text-xl font-semibold text-p360-ink tabular-nums">{formatEuros(total)}</span>
      </div>

      {error && <p className="text-sm text-p360-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Enregistrement…" : "Enregistrer la vente"}</button>
    </form>
  );
}
