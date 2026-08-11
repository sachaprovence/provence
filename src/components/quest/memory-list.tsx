"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

export type MemoryItem = {
  id: string;
  content: string;
  confidence: number;
  confirmedByUser: boolean | null;
  type: string;
};

/** "Ce que l'IA sait sur moi" (§36 du brief) — contrôle utilisateur explicite sur chaque mémoire. */
export function MemoryList({ memories }: { memories: MemoryItem[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function act(id: string, action: "CONFIRM" | "DELETE") {
    setPending(id);
    try {
      const res = await fetch(`/api/quest/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Échec.");
      push({ title: action === "CONFIRM" ? "Confirmé" : "Supprimée", variant: "success" });
      router.refresh();
    } catch {
      push({ title: "Une erreur est survenue", variant: "error" });
    } finally {
      setPending(null);
    }
  }

  if (memories.length === 0) {
    return <p className="text-sm text-quest-muted">Rien pour l&apos;instant — je te connaîtrai mieux au fil des quêtes.</p>;
  }

  return (
    <div className="space-y-2">
      {memories.map((m) => (
        <div key={m.id} className="quest-card p-3 space-y-2">
          <p className="text-sm">{m.content}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-quest-muted">Confiance : {Math.round(m.confidence * 100)}%{m.confirmedByUser ? " · confirmée" : ""}</span>
            <div className="flex gap-2">
              {!m.confirmedByUser && (
                <button className="text-xs text-quest-accent" disabled={pending === m.id} onClick={() => act(m.id, "CONFIRM")}>
                  Confirmer
                </button>
              )}
              <button className="text-xs text-quest-danger" disabled={pending === m.id} onClick={() => act(m.id, "DELETE")}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
