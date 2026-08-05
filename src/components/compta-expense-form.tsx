"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

type Supplier = { id: string; name: string };

function todayLocalDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: "INGREDIENTS", label: "Matières premières" },
  { value: "RENT", label: "Loyer" },
  { value: "UTILITIES", label: "Charges (eau/élec/gaz)" },
  { value: "SALARIES", label: "Salaires" },
  { value: "EQUIPMENT", label: "Équipement" },
  { value: "MARKETING", label: "Marketing" },
  { value: "TAXES", label: "Impôts et taxes" },
  { value: "OTHER", label: "Autre" },
];

export function ComptaExpenseForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [spentAt, setSpentAt] = useState(todayLocalDate());
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("20");
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/compta/expenses", {
        spentAt: new Date(spentAt).toISOString(),
        amount: Math.round(Number(amount) * 100),
        vatRate: Number(vatRate),
        category,
        description,
        supplierId: supplierId || undefined,
      });
      router.push("/compta/depenses");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Date</label>
          <input required type="date" className="input" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
        </div>
        <div>
          <label className="label">Montant TTC (€)</label>
          <input required type="number" min="0.01" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">TVA (%)</label>
          <input required type="number" min="0" max="100" step="0.1" className="input" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
        </div>
        <div>
          <label className="label">Catégorie</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Fournisseur (optionnel)</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <input required className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Enregistrement…" : "Ajouter la dépense"}</button>
    </form>
  );
}
