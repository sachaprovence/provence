"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

type Service = { id: string; name: string; basePrice: number; kind: string };

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function ServicesManager({ services }: { services: Service[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !basePrice) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/services", { kind: "CUSTOM", name, basePrice: Math.round(Number(basePrice) * 100) });
      setName("");
      setBasePrice("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'ajout de l'offre.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ul className="divide-y divide-p360-lavender-light mb-4">
        {services.map((s) => (
          <li key={s.id} className="py-2 text-sm flex justify-between">
            <span className="text-p360-ink">{s.name}</span>
            <span className="text-p360-muted tabular-nums">{formatEuros(s.basePrice)}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 items-end">
        <div>
          <label className="label">Nouvelle offre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Offre spéciale camping" />
        </div>
        <div>
          <label className="label">Prix (€)</label>
          <input type="number" className="input w-28" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
        </div>
        <button className="btn-secondary" disabled={busy}>Ajouter</button>
      </form>
      {error && <p className="text-sm text-p360-danger mt-2">{error}</p>}
    </div>
  );
}
