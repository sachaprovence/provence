"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPut, ApiError } from "@/lib/api-client";
import { MESSAGE_TYPE_LABEL } from "@/lib/labels";

type Step = {
  order: number;
  delayDays: number;
  channel: string;
  templateKey: string;
  allowedStartHour: number;
  allowedEndHour: number;
  allowedWeekdays: number[];
  requiresValidation: boolean;
};

const DEFAULT_STEPS: Step[] = [
  { order: 1, delayDays: 0, channel: "EMAIL", templateKey: "FIRST_CONTACT_EMAIL", allowedStartHour: 8, allowedEndHour: 18, allowedWeekdays: [1, 2, 3, 4, 5], requiresValidation: true },
  { order: 2, delayDays: 3, channel: "EMAIL", templateKey: "FOLLOW_UP_SHORT", allowedStartHour: 8, allowedEndHour: 18, allowedWeekdays: [1, 2, 3, 4, 5], requiresValidation: true },
  { order: 3, delayDays: 7, channel: "EMAIL", templateKey: "FOLLOW_UP_CASE_STUDY", allowedStartHour: 8, allowedEndHour: 18, allowedWeekdays: [1, 2, 3, 4, 5], requiresValidation: true },
  { order: 4, delayDays: 14, channel: "EMAIL", templateKey: "FOLLOW_UP_SHORT", allowedStartHour: 8, allowedEndHour: 18, allowedWeekdays: [1, 2, 3, 4, 5], requiresValidation: true },
];

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

export function SequenceBuilder({
  sequenceId,
  initial,
}: {
  sequenceId?: string;
  initial?: { name: string; description: string; isActive: boolean; steps: Step[] };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [steps, setSteps] = useState<Step[]>(initial?.steps ?? DEFAULT_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    const last = steps[steps.length - 1];
    setSteps((prev) => [
      ...prev,
      { order: prev.length + 1, delayDays: (last?.delayDays ?? 0) + 7, channel: "EMAIL", templateKey: "FOLLOW_UP_SHORT", allowedStartHour: 8, allowedEndHour: 18, allowedWeekdays: [1, 2, 3, 4, 5], requiresValidation: true },
    ]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
  }

  function toggleWeekday(index: number, day: number) {
    const step = steps[index];
    const has = step.allowedWeekdays.includes(day);
    updateStep(index, { allowedWeekdays: has ? step.allowedWeekdays.filter((d) => d !== day) : [...step.allowedWeekdays, day].sort() });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (sequenceId) {
        await apiPut(`/api/sequences/${sequenceId}`, { name, description, isActive, steps });
        router.push(`/sequences/${sequenceId}`);
      } else {
        const res = await apiPost<{ sequence: { id: string } }>("/api/sequences", { name, description, isActive, steps });
        router.push(`/sequences/${res.sequence.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Nom de la séquence</label>
          <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prospection standard" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <input id="active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <label htmlFor="active" className="text-sm text-p360-ink">Séquence active</label>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-p360-ink">Étape {i + 1} — jour {step.delayDays}</span>
              {steps.length > 1 && (
                <button type="button" className="text-xs text-p360-danger" onClick={() => removeStep(i)}>Supprimer</button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="label">Délai (jours)</label>
                <input type="number" min={0} className="input" value={step.delayDays} onChange={(e) => updateStep(i, { delayDays: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Canal</label>
                <select className="input" value={step.channel} onChange={(e) => updateStep(i, { channel: e.target.value })}>
                  <option value="EMAIL">Email</option>
                  <option value="LINKEDIN">LinkedIn</option>
                  <option value="SMS">SMS</option>
                  <option value="CALL">Appel</option>
                </select>
              </div>
              <div>
                <label className="label">Modèle de message</label>
                <select className="input" value={step.templateKey} onChange={(e) => updateStep(i, { templateKey: e.target.value })}>
                  {Object.entries(MESSAGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2 pb-2">
                <input
                  id={`validation-${i}`}
                  type="checkbox"
                  checked={step.requiresValidation}
                  onChange={(e) => updateStep(i, { requiresValidation: e.target.checked })}
                />
                <label htmlFor={`validation-${i}`} className="text-xs text-p360-ink">Validation humaine obligatoire</label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Heures autorisées</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={23} className="input w-20" value={step.allowedStartHour} onChange={(e) => updateStep(i, { allowedStartHour: Number(e.target.value) })} />
                  <span className="text-p360-muted text-sm">à</span>
                  <input type="number" min={1} max={24} className="input w-20" value={step.allowedEndHour} onChange={(e) => updateStep(i, { allowedEndHour: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="label">Jours autorisés</label>
                <div className="flex gap-1 flex-wrap">
                  {WEEKDAYS.map((d) => (
                    <button
                      type="button"
                      key={d.value}
                      onClick={() => toggleWeekday(i, d.value)}
                      className={`text-xs px-2 py-1 rounded ${step.allowedWeekdays.includes(d.value) ? "bg-p360-blue text-white" : "bg-gray-100 text-gray-600"}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addStep} className="btn-secondary text-sm">+ Ajouter une étape</button>
      </div>

      {error && <p className="text-sm text-p360-danger">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary">{loading ? "Enregistrement…" : sequenceId ? "Enregistrer" : "Créer la séquence"}</button>
    </form>
  );
}
