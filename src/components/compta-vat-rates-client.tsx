"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, ApiError } from "@/lib/api-client";

type VatRate = { id: string; name: string; rate: number; isActive: boolean };

const EMPTY_FORM = { name: "", rate: "" };

export function ComptaVatRatesClient({ initialRates }: { initialRates: VatRate[] }) {
  const router = useRouter();
  const [rates, setRates] = useState(initialRates);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", rate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { rate } = await apiPost<{ rate: VatRate }>("/api/compta/vat-rates", { name: form.name, rate: Number(form.rate) });
      setRates((current) => [...current, rate].sort((a, b) => a.rate - b.rate));
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de créer ce taux.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(rate: VatRate) {
    setEditingId(rate.id);
    setEditDraft({ name: rate.name, rate: String(rate.rate) });
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { rate } = await apiPatch<{ rate: VatRate }>(`/api/compta/vat-rates/${id}`, { name: editDraft.name, rate: Number(editDraft.rate) });
      setRates((current) => current.map((r) => (r.id === id ? rate : r)).sort((a, b) => a.rate - b.rate));
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de modifier ce taux.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(rate: VatRate) {
    setBusy(true);
    setError(null);
    try {
      const { rate: updated } = await apiPatch<{ rate: VatRate }>(`/api/compta/vat-rates/${rate.id}`, { isActive: !rate.isActive });
      setRates((current) => current.map((r) => (r.id === rate.id ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de modifier ce taux.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-p360-ink">Taux de TVA</h2>
        <button type="button" className="btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Annuler" : "+ Nouveau taux"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createRate} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
          <div>
            <label className="label">Nom</label>
            <input required className="input" placeholder="TVA restauration" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Taux (%)</label>
            <input required type="number" step="0.1" min="0" max="100" className="input" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
          </div>
          <button type="submit" disabled={busy} className="btn-primary">Créer</button>
        </form>
      )}

      {error && <p className="text-sm text-p360-danger">{error}</p>}

      <div className="divide-y divide-p360-lavender-light">
        {rates.map((rate) => (
          <div key={rate.id} className="py-2.5 flex items-center gap-3">
            {editingId === rate.id ? (
              <>
                <input className="input flex-1" value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} />
                <input type="number" step="0.1" min="0" max="100" className="input w-24" value={editDraft.rate} onChange={(e) => setEditDraft((d) => ({ ...d, rate: e.target.value }))} />
                <button type="button" disabled={busy} className="btn-primary" onClick={() => saveEdit(rate.id)}>OK</button>
                <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>Annuler</button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <span className={rate.isActive ? "text-p360-ink font-medium" : "text-p360-muted line-through"}>{rate.name}</span>
                  <span className="text-p360-muted ml-2 tabular-nums">{rate.rate} %</span>
                  {!rate.isActive && <span className="badge bg-p360-lavender-light text-p360-muted ml-2">Désactivé</span>}
                </div>
                <button type="button" className="btn-ghost" onClick={() => startEdit(rate)}>Modifier</button>
                <button type="button" disabled={busy} className="btn-ghost" onClick={() => toggleActive(rate)}>
                  {rate.isActive ? "Désactiver" : "Activer"}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
