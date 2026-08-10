"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

type Supplier = { id: string; name: string };
type Ingredient = { id: string; name: string; unit: string };
type Line = { ingredientId: string; label: string; quantity: string; unitCost: string };
type PurchaseOrder = {
  id: string;
  status: string;
  totalAmount: number;
  createdAt: string | Date;
  supplier: { id: string; name: string };
  lines: { id: string; label: string; quantity: number; unitCost: number }[];
  payments: { id: string; amount: number }[];
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  ORDERED: "Commandée",
  RECEIVED: "Réceptionnée",
  CANCELLED: "Annulée",
};

function emptyLine(): Line {
  return { ingredientId: "", label: "", quantity: "1", unitCost: "" };
}

export function ComptaPurchaseOrdersClient({
  purchaseOrders,
  suppliers,
  ingredients,
}: {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [paying, setPaying] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Virement");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    try {
      await apiPost("/api/compta/purchase-orders", {
        supplierId,
        lines: lines
          .filter((l) => l.label && Number(l.quantity) > 0)
          .map((l) => ({
            ingredientId: l.ingredientId || undefined,
            label: l.label,
            quantity: Number(l.quantity),
            unitCost: Math.round(Number(l.unitCost) * 100),
          })),
      });
      setSupplierId("");
      setLines([emptyLine()]);
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function action(id: string, path: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/api/compta/purchase-orders/${id}/${path}`, {});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function submitPayment(id: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/api/compta/purchase-orders/${id}/payments`, {
        amount: Math.round(Number(paymentAmount) * 100),
        method: paymentMethod,
      });
      setPaying(null);
      setPaymentAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)} disabled={suppliers.length === 0}>
          {showForm ? "Annuler" : "Nouvelle commande"}
        </button>
      </div>
      {suppliers.length === 0 && <p className="text-sm text-p360-muted">Ajoutez d&apos;abord un fournisseur.</p>}

      {showForm && (
        <form onSubmit={submit} className="card p-4 space-y-3">
          <div>
            <label className="label">Fournisseur</label>
            <select required className="input max-w-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3">
                <label className="label">Ingrédient (optionnel)</label>
                <select
                  className="input"
                  value={line.ingredientId}
                  onChange={(e) => {
                    const ingredient = ingredients.find((i) => i.id === e.target.value);
                    updateLine(index, { ingredientId: e.target.value, label: ingredient ? ingredient.name : line.label });
                  }}
                >
                  <option value="">—</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <label className="label">Libellé</label>
                <input required className="input" value={line.label} onChange={(e) => updateLine(index, { label: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label">Quantité</label>
                <input type="number" min="0" step="0.01" className="input" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label">Coût unitaire (€)</label>
                <input type="number" min="0" step="0.01" className="input" value={line.unitCost} onChange={(e) => updateLine(index, { unitCost: e.target.value })} />
              </div>
              <div className="col-span-1">
                <button type="button" className="btn-ghost w-full" disabled={lines.length === 1} onClick={() => setLines((c) => c.filter((_, i) => i !== index))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setLines((c) => [...c, emptyLine()])}>
            + Ajouter une ligne
          </button>
          {error && <p className="text-sm text-p360-danger">{error}</p>}
          <button type="submit" disabled={busy === "create"} className="btn-primary">{busy === "create" ? "Création…" : "Créer la commande"}</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        {error && !showForm && <div className="p-3 text-sm text-p360-danger">{error}</div>}
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Fournisseur</th>
              <th className="text-left px-4 py-2">Contenu</th>
              <th className="text-left px-4 py-2">Statut</th>
              <th className="text-left px-4 py-2">Total</th>
              <th className="text-left px-4 py-2">Payé</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => {
              const paid = po.payments.reduce((sum, p) => sum + p.amount, 0);
              return (
                <tr key={po.id} className="border-t border-p360-lavender-light align-top">
                  <td className="px-4 py-2 text-p360-muted">{new Date(po.createdAt).toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-2 text-p360-ink">{po.supplier.name}</td>
                  <td className="px-4 py-2 text-p360-muted">{po.lines.map((l) => `${l.quantity}× ${l.label}`).join(", ")}</td>
                  <td className="px-4 py-2">
                    <span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[po.status] ?? po.status}</span>
                  </td>
                  <td className="px-4 py-2 tabular-nums font-medium">{formatEuros(po.totalAmount)}</td>
                  <td className="px-4 py-2 tabular-nums text-p360-muted">{formatEuros(paid)}</td>
                  <td className="px-4 py-2 space-y-1">
                    <div className="flex flex-wrap gap-2">
                      {po.status === "DRAFT" && (
                        <button className="text-xs text-p360-blue hover:underline" disabled={busy === po.id} onClick={() => action(po.id, "order")}>
                          Passer commande
                        </button>
                      )}
                      {(po.status === "DRAFT" || po.status === "ORDERED") && (
                        <>
                          <button className="text-xs text-p360-success hover:underline" disabled={busy === po.id} onClick={() => action(po.id, "receive")}>
                            Réceptionner
                          </button>
                          <button className="text-xs text-p360-danger hover:underline" disabled={busy === po.id} onClick={() => action(po.id, "cancel")}>
                            Annuler
                          </button>
                        </>
                      )}
                      {po.status === "RECEIVED" && paid < po.totalAmount && (
                        <button className="text-xs text-p360-blue hover:underline" onClick={() => { setPaying(po.id); setPaymentAmount(String((po.totalAmount - paid) / 100)); }}>
                          Payer
                        </button>
                      )}
                    </div>
                    {paying === po.id && (
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <input type="number" min="0" step="0.01" className="input w-24" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                        <select className="input w-32" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                          <option>Virement</option>
                          <option>Chèque</option>
                          <option>Espèces</option>
                          <option>Carte</option>
                        </select>
                        <button className="text-xs text-p360-success hover:underline" disabled={busy === po.id} onClick={() => submitPayment(po.id)}>
                          Valider
                        </button>
                        <button className="text-xs text-p360-muted hover:underline" onClick={() => setPaying(null)}>
                          Annuler
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {purchaseOrders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-p360-muted">Aucune commande fournisseur.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
