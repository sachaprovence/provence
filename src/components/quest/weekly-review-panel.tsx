"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

export type WeeklyReviewData = {
  weekStart: string;
  questsCompleted: number;
  xpGained: number;
  observations: string[];
  suggestions: string[];
} | null;

/** Bilan hebdomadaire (§37 du brief) — calculable à la demande dans ce lot (pas de cron, voir ADR 0049). */
export function WeeklyReviewPanel({ review }: { review: WeeklyReviewData }) {
  const router = useRouter();
  const { push } = useToast();
  const [loading, setLoading] = useState(false);

  async function compute() {
    setLoading(true);
    try {
      const res = await fetch("/api/quest/weekly-review", { method: "POST" });
      if (!res.ok) throw new Error("Échec.");
      router.refresh();
    } catch {
      push({ title: "Une erreur est survenue", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="quest-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Bilan de la semaine</p>
        <button className="text-xs text-quest-accent" disabled={loading} onClick={compute}>
          {loading ? "…" : "Recalculer"}
        </button>
      </div>
      {review ? (
        <>
          <p className="text-sm">
            {review.questsCompleted} quête{review.questsCompleted > 1 ? "s" : ""} terminée{review.questsCompleted > 1 ? "s" : ""} · +{review.xpGained} XP
          </p>
          {review.observations.length > 0 && (
            <ul className="text-sm text-quest-muted list-disc list-inside space-y-1">
              {review.observations.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
          {review.suggestions.length > 0 && (
            <div className="text-sm space-y-1">
              <p className="font-medium">Suggestion</p>
              <ul className="text-quest-muted list-disc list-inside space-y-1">
                {review.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-quest-muted">Pas encore de bilan cette semaine.</p>
      )}
    </div>
  );
}
