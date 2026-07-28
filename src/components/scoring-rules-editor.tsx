"use client";

import { useState } from "react";
import { apiPut, ApiError } from "@/lib/api-client";
import type { ScoringRule } from "@/lib/scoring";

export function ScoringRulesEditor({ initialRules }: { initialRules: ScoringRule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(id: string, patch: Partial<ScoringRule>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiPut("/api/settings/scoring", { rules });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead className="text-xs text-p360-muted uppercase">
          <tr>
            <th className="text-left py-1.5">Actif</th>
            <th className="text-left py-1.5">Critère</th>
            <th className="text-left py-1.5 w-28">Points</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-t border-p360-lavender-light">
              <td className="py-2">
                <input type="checkbox" checked={rule.enabled} onChange={(e) => update(rule.id, { enabled: e.target.checked })} />
              </td>
              <td className="py-2 text-p360-ink">{rule.label}</td>
              <td className="py-2">
                <input
                  type="number"
                  className="input w-24"
                  value={rule.points}
                  onChange={(e) => update(rule.id, { points: Number(e.target.value) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {saved && <p className="text-sm text-p360-success">Enregistré.</p>}
      <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer les règles"}</button>
    </div>
  );
}
