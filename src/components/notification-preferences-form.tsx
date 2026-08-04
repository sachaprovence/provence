"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";

type Channel = "APP" | "EMAIL";
type PreferenceRow = { eventKey: string; channel: Channel; enabled: boolean };

const EVENT_LABELS: Record<string, string> = {
  "lead.created": "Nouveau prospect créé",
  "quote.signed": "Devis signé",
  "invoice.paid": "Paiement reçu",
  "invoice.overdue": "Facture en retard",
};

/**
 * Préférences de notification (v1.1, AR-0180) — par utilisateur (chaque
 * membre gère les siennes), canal (application/email) x évènement.
 * Décocher une case désactive uniquement CE canal pour CET évènement,
 * pour l'utilisateur courant — jamais les autres utilisateurs ni les
 * autres évènements.
 */
export function NotificationPreferencesForm() {
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<PreferenceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<{ preferences: PreferenceRow[] }>("/api/settings/notification-preferences")
      .then(({ preferences }) => setPreferences(preferences))
      .finally(() => setLoading(false));
  }, []);

  function toggle(eventKey: string, channel: Channel) {
    setPreferences((prev) => prev.map((p) => (p.eventKey === eventKey && p.channel === channel ? { ...p, enabled: !p.enabled } : p)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { preferences: updated } = await apiPut<{ preferences: PreferenceRow[] }>("/api/settings/notification-preferences", {
        preferences,
      });
      setPreferences(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-p360-muted">Chargement…</p>;

  const eventKeys = Array.from(new Set(preferences.map((p) => p.eventKey)));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-p360-muted">
            <tr>
              <th className="text-left py-1 pr-4">Évènement</th>
              <th className="text-left py-1 pr-4">Application</th>
              <th className="text-left py-1">Email</th>
            </tr>
          </thead>
          <tbody>
            {eventKeys.map((eventKey) => {
              const app = preferences.find((p) => p.eventKey === eventKey && p.channel === "APP");
              const email = preferences.find((p) => p.eventKey === eventKey && p.channel === "EMAIL");
              return (
                <tr key={eventKey} className="border-t border-p360-lavender-light">
                  <td className="py-2 pr-4 text-p360-ink">{EVENT_LABELS[eventKey] ?? eventKey}</td>
                  <td className="py-2 pr-4">
                    <input type="checkbox" checked={app?.enabled ?? true} onChange={() => toggle(eventKey, "APP")} />
                  </td>
                  <td className="py-2">
                    <input type="checkbox" checked={email?.enabled ?? true} onChange={() => toggle(eventKey, "EMAIL")} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {saved && <p className="text-sm text-p360-success">Enregistré.</p>}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
