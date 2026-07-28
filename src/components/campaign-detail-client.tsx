"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, apiPut, ApiError } from "@/lib/api-client";
import { STAGE_LABEL } from "@/lib/labels";
import { ScoreBadge } from "@/components/score-badge";

type Lead = { id: string; establishmentName: string; city: string | null; stage: string; scores: { value: number }[] };
type Campaign = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  sequence: { id: string; name: string } | null;
  leads: Lead[];
  enrollments: { leadId: string; status: string }[];
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Brouillon", ACTIVE: "Active", PAUSED: "En pause", COMPLETED: "Terminée" };

export function CampaignDetailClient({ campaign, availableLeads }: { campaign: Campaign; availableLeads: Lead[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addLeads() {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ attached: number; enrolled: number; skipped: { leadId: string; reason: string }[] }>(
        `/api/campaigns/${campaign.id}/add-leads`,
        { leadIds: selected }
      );
      setResult(`${res.attached} prospect(s) ajouté(s), ${res.enrolled} inscrit(s) dans la séquence.${res.skipped.length ? ` ${res.skipped.length} ignoré(s).` : ""}`);
      setSelected([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      await apiPut(`/api/campaigns/${campaign.id}`, { status });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-p360-ink">{campaign.name}</h1>
          <p className="text-p360-muted text-sm mt-1">{campaign.sequence?.name ?? "Aucune séquence"} — {campaign.description}</p>
        </div>
        <select className="input w-40" value={campaign.status} disabled={busy} onChange={(e) => changeStatus(e.target.value)}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-p360-ink mb-3">Ajouter des prospects à la campagne</h2>
        <div className="max-h-64 overflow-y-auto border border-p360-lavender-light rounded-lg divide-y divide-p360-lavender-light">
          {availableLeads.map((lead) => (
            <label key={lead.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-p360-offwhite">
              <input
                type="checkbox"
                checked={selected.includes(lead.id)}
                onChange={(e) =>
                  setSelected((prev) => (e.target.checked ? [...prev, lead.id] : prev.filter((id) => id !== lead.id)))
                }
              />
              <span className="text-p360-ink">{lead.establishmentName}</span>
              <span className="text-p360-muted text-xs">{lead.city}</span>
            </label>
          ))}
          {availableLeads.length === 0 && <p className="px-3 py-4 text-sm text-p360-muted">Tous les prospects sont déjà dans une campagne.</p>}
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button className="btn-primary" disabled={busy || selected.length === 0} onClick={addLeads}>
            Ajouter {selected.length > 0 ? `(${selected.length})` : ""}
          </button>
          {result && <span className="text-xs text-p360-success">{result}</span>}
          {error && <span className="text-xs text-p360-danger">{error}</span>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Établissement</th>
              <th className="text-left px-4 py-2">Étape</th>
              <th className="text-left px-4 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {campaign.leads.map((lead) => (
              <tr key={lead.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2"><Link href={`/leads/${lead.id}`} className="text-p360-blue hover:underline">{lead.establishmentName}</Link></td>
                <td className="px-4 py-2 text-p360-ink">{STAGE_LABEL[lead.stage]}</td>
                <td className="px-4 py-2"><ScoreBadge value={lead.scores[0]?.value} /></td>
              </tr>
            ))}
            {campaign.leads.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-p360-muted">Aucun prospect dans cette campagne.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
