"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPut, apiPost, ApiError } from "@/lib/api-client";
import type { PipelineStageModel } from "@/generated/prisma/models";

/**
 * Personnalisation du pipeline (brief v0.9 : "Le pipeline doit être
 * totalement personnalisable") — libellé, couleur et ordre d'affichage.
 * `Lead.stage` (la sémantique métier) n'est jamais modifiée ici, voir
 * `src/lib/crm/pipeline-service.ts` et ADR 0038.
 */
export function PipelineStagesManager({ stages }: { stages: PipelineStageModel[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...stages].sort((a, b) => a.order - b.order);

  async function saveStage(stageKey: string, patch: { label?: string; color?: string }) {
    setBusy(stageKey);
    setError(null);
    try {
      await apiPut(`/api/pipeline-stages/${stageKey}`, patch);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBusy("reorder");
    setError(null);
    try {
      await apiPost("/api/pipeline-stages/reorder", { orderedStageKeys: reordered.map((s) => s.stageKey) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <div className="text-sm text-p360-danger mb-3">{error}</div>}
      <ul className="divide-y divide-p360-lavender-light">
        {sorted.map((stage, index) => (
          <li key={stage.stageKey} className="py-2 flex items-center gap-3">
            <div className="flex flex-col">
              <button type="button" className="text-p360-muted hover:text-p360-ink disabled:opacity-30" disabled={index === 0 || busy !== null} onClick={() => move(index, -1)}>▲</button>
              <button type="button" className="text-p360-muted hover:text-p360-ink disabled:opacity-30" disabled={index === sorted.length - 1 || busy !== null} onClick={() => move(index, 1)}>▼</button>
            </div>
            <input
              type="color"
              className="h-8 w-8 rounded border border-p360-lavender-light shrink-0"
              value={stage.color}
              disabled={busy === stage.stageKey}
              onChange={(e) => saveStage(stage.stageKey, { color: e.target.value })}
            />
            <input
              className="input flex-1"
              defaultValue={stage.label}
              disabled={busy === stage.stageKey}
              onBlur={(e) => {
                if (e.target.value !== stage.label) saveStage(stage.stageKey, { label: e.target.value });
              }}
            />
            <span className="text-xs text-p360-muted w-32 text-right">{stage.stageKey}</span>
            <span className="badge bg-p360-lavender-light text-p360-blue">{stage.category}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
