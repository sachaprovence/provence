"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { CATEGORY_LABEL } from "@/lib/labels";

type Icp = {
  id: string;
  name: string;
  category: string;
  zones: string[];
  priority: number;
  minRating: number | null;
  minReviewCount: number | null;
  hasVirtualTourExpected: boolean;
  _count: { leads: number };
};

export function IcpManager({ icps }: { icps: Icp[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", category: "AIRBNB_HOST", zones: "", priority: "3", minRating: "", minReviewCount: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/icp", {
        name: form.name,
        category: form.category,
        zones: form.zones.split(",").map((z) => z.trim()).filter(Boolean),
        priority: Number(form.priority),
        minRating: form.minRating || undefined,
        minReviewCount: form.minReviewCount || undefined,
      });
      setForm({ name: "", category: "AIRBNB_HOST", zones: "", priority: "3", minRating: "", minReviewCount: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-p360-lavender-light">
        {icps.map((icp) => (
          <li key={icp.id} className="py-2 text-sm flex justify-between items-center">
            <div>
              <div className="text-p360-ink font-medium">{icp.name}</div>
              <div className="text-xs text-p360-muted">{CATEGORY_LABEL[icp.category]} — {icp.zones.join(", ") || "toutes zones"} — priorité {icp.priority}</div>
            </div>
            <span className="text-xs text-p360-muted">{icp._count.leads} prospect(s)</span>
          </li>
        ))}
        {icps.length === 0 && <li className="py-3 text-sm text-p360-muted">Aucun profil de client idéal défini.</li>}
      </ul>

      <form onSubmit={submit} className="border-t border-p360-lavender-light pt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label">Nom du profil</label>
          <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Propriétaire Airbnb multi-logements" />
        </div>
        <div>
          <label className="label">Catégorie</label>
          <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Zones (séparées par virgule)</label>
          <input className="input" value={form.zones} onChange={(e) => setForm((f) => ({ ...f, zones: e.target.value }))} placeholder="Avignon, Aix-en-Provence" />
        </div>
        <div>
          <label className="label">Priorité (1-5)</label>
          <input type="number" min={1} max={5} className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
        </div>
        <div>
          <label className="label">Note moyenne minimum</label>
          <input type="number" step="0.1" className="input" value={form.minRating} onChange={(e) => setForm((f) => ({ ...f, minRating: e.target.value }))} />
        </div>
        <div>
          <label className="label">Nombre d&apos;avis minimum</label>
          <input type="number" className="input" value={form.minReviewCount} onChange={(e) => setForm((f) => ({ ...f, minReviewCount: e.target.value }))} />
        </div>
        {error && <p className="text-sm text-p360-danger col-span-2">{error}</p>}
        <button type="submit" disabled={busy} className="btn-secondary col-span-2 w-fit">Ajouter ce profil</button>
      </form>
    </div>
  );
}
