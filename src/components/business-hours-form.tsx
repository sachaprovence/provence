"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";

type DayHours = { dayOfWeek: number; isOpen: boolean; opensAt: string | null; closesAt: string | null };
type BusinessHoursConfig = { appointmentSlotCapacity: number; hours: DayHours[] };

const DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/**
 * Réglages d'agenda (v1.1, AR-0179) — horaires d'ouverture par jour et
 * capacité par créneau (nombre de RDV/visites simultanés max), consommés
 * par l'Agent Planning (`planning.suggest_slots`) pour ne proposer que des
 * créneaux réellement disponibles. Horaires exprimés en UTC (voir
 * `business-hours-service.ts`). Absence de restriction sur un jour ouvert
 * (champs horaires vides) = disponible toute la journée.
 */
export function BusinessHoursForm() {
  const [loading, setLoading] = useState(true);
  const [capacity, setCapacity] = useState("1");
  const [hours, setHours] = useState<DayHours[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<{ config: BusinessHoursConfig }>("/api/settings/business-hours")
      .then(({ config }) => {
        setCapacity(String(config.appointmentSlotCapacity));
        setHours(config.hours);
      })
      .finally(() => setLoading(false));
  }, []);

  function updateDay(dayOfWeek: number, patch: Partial<DayHours>) {
    setHours((prev) => prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { config } = await apiPut<{ config: BusinessHoursConfig }>("/api/settings/business-hours", {
        appointmentSlotCapacity: Number(capacity),
        hours,
      });
      setCapacity(String(config.appointmentSlotCapacity));
      setHours(config.hours);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-p360-muted">Chargement…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="max-w-xs">
        <label className="label">Capacité par créneau (RDV/visites simultanés max)</label>
        <input
          className="input"
          type="number"
          min={1}
          max={100}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-p360-muted">
            <tr>
              <th className="text-left py-1 pr-4">Jour</th>
              <th className="text-left py-1 pr-4">Ouvert</th>
              <th className="text-left py-1 pr-4">Ouverture</th>
              <th className="text-left py-1">Fermeture</th>
            </tr>
          </thead>
          <tbody>
            {hours.map((day) => (
              <tr key={day.dayOfWeek} className="border-t border-p360-lavender-light">
                <td className="py-2 pr-4 text-p360-ink">{DAY_LABELS[day.dayOfWeek]}</td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={day.isOpen}
                    onChange={(e) => updateDay(day.dayOfWeek, { isOpen: e.target.checked })}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    className="input"
                    type="time"
                    disabled={!day.isOpen}
                    value={day.opensAt ?? ""}
                    onChange={(e) => updateDay(day.dayOfWeek, { opensAt: e.target.value || null })}
                  />
                </td>
                <td className="py-2">
                  <input
                    className="input"
                    type="time"
                    disabled={!day.isOpen}
                    value={day.closesAt ?? ""}
                    onChange={(e) => updateDay(day.dayOfWeek, { closesAt: e.target.value || null })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-p360-muted">
        Un jour ouvert sans horaires renseignés reste disponible toute la journée. Horaires exprimés en UTC.
      </p>

      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {saved && <p className="text-sm text-p360-success">Enregistré.</p>}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
