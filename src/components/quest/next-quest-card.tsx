"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

export type NextQuestCardData = {
  id: string;
  title: string;
  description: string | null;
  why: string | null;
  type: string;
  estimatedMinutes: number;
  difficulty: number;
  xpReward: number;
  status: "PENDING" | "ACTIVE" | "DONE" | "POSTPONED" | "BLOCKED" | "REPLACED" | "ABANDONED";
};

const TYPE_LABEL: Record<string, string> = {
  MICRO: "Micro-quête",
  SHORT: "Quête courte",
  NORMAL: "Quête",
  DEEP: "Quête profonde",
  HABIT: "Habitude",
  CHALLENGE: "Challenge",
  BOSS: "Boss",
};

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue.");
  return data;
}

export function NextQuestCard({ quest }: { quest: NextQuestCardData }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [showBlockNote, setShowBlockNote] = useState(false);
  const [note, setNote] = useState("");

  async function run(action: string, url: string, body?: unknown, successMessage?: string) {
    setPending(action);
    try {
      await postJson(url, body);
      if (successMessage) push({ title: successMessage, variant: "success" });
      router.refresh();
    } catch (error) {
      push({ title: "Action impossible", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setPending(null);
    }
  }

  const isActive = quest.status === "ACTIVE";

  return (
    <div className="quest-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="quest-badge">{TYPE_LABEL[quest.type] ?? quest.type}</span>
        <span className="text-xs text-quest-muted">{quest.estimatedMinutes} min · difficulté {quest.difficulty}/5</span>
      </div>

      <div>
        <h2 className="text-lg font-semibold leading-snug">{quest.title}</h2>
        {quest.why && <p className="text-sm text-quest-muted mt-1">{quest.why}</p>}
      </div>

      {quest.description && <p className="text-sm text-quest-ink/80">{quest.description}</p>}

      <div className="flex items-center gap-1 text-sm font-medium text-quest-gold">
        <span>+{quest.xpReward} XP</span>
      </div>

      {showBlockNote ? (
        <div className="space-y-2">
          <textarea
            className="quest-input"
            rows={2}
            placeholder="Qu'est-ce qui bloque ? (optionnel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="quest-btn-primary flex-1"
              disabled={pending !== null}
              onClick={() => run("blocked", `/api/quest/quests/${quest.id}/blocked`, { note: note || undefined }, "Je m'occupe de la décomposer")}
            >
              Confirmer
            </button>
            <button className="quest-btn-ghost" onClick={() => setShowBlockNote(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!isActive ? (
            <button className="quest-btn-primary w-full" disabled={pending !== null} onClick={() => run("start", `/api/quest/quests/${quest.id}/start`)}>
              {pending === "start" ? "…" : "Commencer"}
            </button>
          ) : (
            <button
              className="quest-btn-primary w-full"
              disabled={pending !== null}
              onClick={() => run("complete", `/api/quest/quests/${quest.id}/complete`, {}, "Bravo, quête terminée !")}
            >
              {pending === "complete" ? "…" : "Terminer"}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              className="quest-btn-secondary"
              disabled={pending !== null}
              onClick={() => run("postpone", `/api/quest/quests/${quest.id}/postpone`, {}, "Reportée")}
            >
              Reporter
            </button>
            <button
              className="quest-btn-secondary"
              disabled={pending !== null}
              onClick={() => run("replace", `/api/quest/quests/${quest.id}/replace`, {}, "Remplacée")}
            >
              Remplacer
            </button>
            <button
              className="quest-btn-secondary"
              disabled={pending !== null}
              onClick={() => run("too-hard", `/api/quest/quests/${quest.id}/too-hard`, {}, "On la découpe en plus petit")}
            >
              Trop difficile
            </button>
            <button
              className="quest-btn-secondary"
              disabled={pending !== null}
              onClick={() => run("too-easy", `/api/quest/quests/${quest.id}/too-easy`, {}, "Noté, on montera le niveau")}
            >
              Trop facile
            </button>
          </div>
          <button className="quest-btn-ghost w-full" disabled={pending !== null} onClick={() => setShowBlockNote(true)}>
            Je suis bloqué
          </button>
        </div>
      )}
    </div>
  );
}
