"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
};

const EMPTY_FORM = { name: "", phone: "", email: "", notes: "" };

export function ComptaCustomersClient({ customers }: { customers: Customer[] }) {
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
      await apiPost("/api/compta/customers", {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        notes: form.notes || undefined,
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Annuler" : "Nouveau client"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Nom</label>
            <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="col-span-full">
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-p360-danger col-span-full">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-fit col-span-full">{busy ? "Ajout…" : "Ajouter le client"}</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Téléphone</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Points de fidélité</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">{customer.name}</td>
                <td className="px-4 py-2 text-p360-muted">{customer.phone ?? "—"}</td>
                <td className="px-4 py-2 text-p360-muted">{customer.email ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums text-p360-blue font-medium">{customer.loyaltyPoints} pts</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-p360-muted">Aucun client enregistré.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
