"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";

type Territory = { id: string; name: string; centerCity: string; radiusKm: number; _count: { leads: number; providers: number; missions: number } };

export function TerritoriesManager({ territories }: { territories: Territory[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [centerCity, setCenterCity] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !centerCity) return;
    setBusy(true);
    try {
      await apiPost("/api/territories", { name, centerCity, radiusKm: 40 });
      setName("");
      setCenterCity("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ul className="divide-y divide-p360-lavender-light mb-4">
        {territories.map((t) => (
          <li key={t.id} className="py-2 text-sm flex justify-between">
            <span className="text-p360-ink">{t.name} <span className="text-p360-muted">({t.centerCity}, {t.radiusKm} km)</span></span>
            <span className="text-p360-muted">{t._count.leads} prospect(s) — {t._count.providers} prestataire(s)</span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 items-end">
        <div>
          <label className="label">Nom du territoire</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Split" />
        </div>
        <div>
          <label className="label">Ville centrale</label>
          <input className="input" value={centerCity} onChange={(e) => setCenterCity(e.target.value)} />
        </div>
        <button className="btn-secondary" disabled={busy}>Ajouter</button>
      </form>
    </div>
  );
}
