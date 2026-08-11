"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

const TIME_OPTIONS = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 h", value: 60 },
  { label: "2 h+", value: 120 },
];

const ENERGY_OPTIONS = [
  { label: "Faible", value: "LOW", scale: 2 },
  { label: "Normale", value: "NORMAL", scale: 3 },
  { label: "Élevée", value: "HIGH", scale: 4 },
] as const;

/** "Que dois-je faire maintenant ?" (§10 du brief) — envoie un check-in rapide qui pilote la sélection de la prochaine quête. */
export function CheckInPanel() {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [energy, setEnergy] = useState<(typeof ENERGY_OPTIONS)[number] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/quest/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availableMinutes: minutes, energy: energy?.scale }),
      });
      if (!res.ok) throw new Error("Échec de l'envoi.");
      push({ title: "C'est noté", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch {
      push({ title: "Une erreur est survenue", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="quest-btn-secondary w-full" onClick={() => setOpen(true)}>
        Que dois-je faire maintenant ?
      </button>
    );
  }

  return (
    <div className="quest-card p-4 space-y-4">
      <p className="text-sm font-medium">Combien de temps as-tu ?</p>
      <div className="flex flex-wrap gap-2">
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setMinutes(opt.value)}
            className="quest-badge"
            style={minutes === opt.value ? { background: "var(--color-quest-accent)", color: "white" } : undefined}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <p className="text-sm font-medium">Ton énergie ?</p>
      <div className="flex flex-wrap gap-2">
        {ENERGY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setEnergy(opt)}
            className="quest-badge"
            style={energy?.value === opt.value ? { background: "var(--color-quest-accent)", color: "white" } : undefined}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button className="quest-btn-primary flex-1" disabled={submitting} onClick={submit}>
          {submitting ? "…" : "Proposer une quête"}
        </button>
        <button className="quest-btn-ghost" onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </div>
  );
}
