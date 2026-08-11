"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

export function GoalStatusActions({ goalId, status }: { goalId: string; status: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, setPending] = useState(false);

  async function setStatus(next: "ACTIVE" | "PAUSED" | "ABANDONED") {
    setPending(true);
    try {
      const res = await fetch(`/api/quest/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("Échec.");
      push({ title: "Mis à jour", variant: "success" });
      router.refresh();
    } catch {
      push({ title: "Une erreur est survenue", variant: "error" });
    } finally {
      setPending(false);
    }
  }

  if (status === "PAUSED") {
    return (
      <button className="quest-btn-primary w-full" disabled={pending} onClick={() => setStatus("ACTIVE")}>
        Reprendre cet objectif
      </button>
    );
  }

  if (status !== "ACTIVE") return null;

  return (
    <div className="flex gap-2">
      <button className="quest-btn-secondary flex-1" disabled={pending} onClick={() => setStatus("PAUSED")}>
        Mettre en pause
      </button>
      <button className="quest-btn-danger flex-1" disabled={pending} onClick={() => setStatus("ABANDONED")}>
        Abandonner
      </button>
    </div>
  );
}
