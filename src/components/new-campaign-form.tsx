"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

export function NewCampaignForm({ sequences }: { sequences: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ campaign: { id: string } }>("/api/campaigns", { name, description, sequenceId: sequenceId || undefined });
      router.push(`/campaigns/${res.campaign.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nom de la campagne</label>
        <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prospection hôtels Avignon" />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label">Séquence associée</label>
        <select className="input" value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
          <option value="">Aucune (ajout manuel plus tard)</option>
          {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {sequences.length === 0 && <p className="text-xs text-p360-muted mt-1">Créez d&apos;abord une séquence pour automatiser cette campagne.</p>}
      </div>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary">{loading ? "Création…" : "Créer la campagne"}</button>
    </form>
  );
}
