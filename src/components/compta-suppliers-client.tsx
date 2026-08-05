"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  balanceDue: number;
};

const EMPTY_FORM = { name: "", contactName: "", email: "", phone: "", address: "" };

export function ComptaSuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
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
      await apiPost("/api/compta/suppliers", {
        name: form.name,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
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
          {showForm ? "Annuler" : "Nouveau fournisseur"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Nom</label>
            <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Contact</label>
            <input className="input" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="col-span-full">
            <label className="label">Adresse</label>
            <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-p360-danger col-span-full">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-fit col-span-full">{busy ? "Ajout…" : "Ajouter le fournisseur"}</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Contact</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Téléphone</th>
              <th className="text-left px-4 py-2">Solde dû</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">{supplier.name}</td>
                <td className="px-4 py-2 text-p360-muted">{supplier.contactName ?? "—"}</td>
                <td className="px-4 py-2 text-p360-muted">{supplier.email ?? "—"}</td>
                <td className="px-4 py-2 text-p360-muted">{supplier.phone ?? "—"}</td>
                <td className={`px-4 py-2 tabular-nums ${supplier.balanceDue > 0 ? "text-p360-danger" : "text-p360-muted"}`}>
                  {formatEuros(supplier.balanceDue)}
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-p360-muted">Aucun fournisseur enregistré.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
