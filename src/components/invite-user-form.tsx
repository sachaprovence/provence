"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

type Territory = { id: string; name: string };

export function InviteUserForm({ territories }: { territories: Territory[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", role: "SALES", territoryId: "", temporaryPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/users", { ...form, territoryId: form.territoryId || undefined });
      setSuccess(true);
      setForm({ email: "", firstName: "", lastName: "", role: "SALES", territoryId: "", temporaryPassword: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div>
        <label className="label">Prénom</label>
        <input required className="input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
      </div>
      <div>
        <label className="label">Nom</label>
        <input required className="input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
      </div>
      <div>
        <label className="label">Email</label>
        <input required type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </div>
      <div>
        <label className="label">Mot de passe temporaire</label>
        <input required minLength={8} type="text" className="input" value={form.temporaryPassword} onChange={(e) => setForm((f) => ({ ...f, temporaryPassword: e.target.value }))} />
      </div>
      <div>
        <label className="label">Rôle</label>
        <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
          <option value="OWNER_ADMIN">Administrateur</option>
          <option value="SALES">Commercial</option>
          <option value="PROVIDER">Prestataire régional</option>
        </select>
      </div>
      {form.role === "PROVIDER" && (
        <div>
          <label className="label">Territoire</label>
          <select className="input" value={form.territoryId} onChange={(e) => setForm((f) => ({ ...f, territoryId: e.target.value }))}>
            <option value="">—</option>
            {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-p360-danger col-span-2">{error}</p>}
      {success && <p className="text-sm text-p360-success col-span-2">Utilisateur ajouté.</p>}
      <button type="submit" disabled={busy} className="btn-primary col-span-2 w-fit">{busy ? "Ajout…" : "Ajouter l'utilisateur"}</button>
    </form>
  );
}
