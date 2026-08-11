import { describe, expect, it } from "vitest";
import { deriveStrategyInsights, type Episode, type MemorySnapshot } from "@/lib/quest/context-builder";

function episode(overrides: Partial<Episode>): Episode {
  return {
    id: `ep-${Math.random()}`,
    date: new Date("2026-08-01"),
    goalId: "goal-1",
    questId: "quest-1",
    questTitle: "Quête test",
    questType: "NORMAL",
    action: "COMPLETED",
    note: null,
    ...overrides,
  };
}

describe("Personal Quest AI — deriveStrategyInsights (Strategy Memory)", () => {
  it("aucun insight sans signal marquant (activité neutre)", () => {
    const insights = deriveStrategyInsights({ episodes: [episode({ action: "COMPLETED" })], memories: [] });
    expect(insights).toEqual([]);
  });

  it("plusieurs 'trop facile' sans échec -> DIFFICULTY_MOMENTUM_UP, avec les IDs réels en evidence", () => {
    const easy1 = episode({ id: "f1", action: "TOO_EASY" });
    const easy2 = episode({ id: "f2", action: "TOO_EASY" });
    const easy3 = episode({ id: "f3", action: "TOO_EASY" });
    const insights = deriveStrategyInsights({ episodes: [easy1, easy2, easy3], memories: [] });

    const up = insights.find((i) => i.type === "DIFFICULTY_MOMENTUM_UP");
    expect(up).toBeDefined();
    expect(up?.evidenceIds).toEqual(expect.arrayContaining(["f1", "f2", "f3"]));
    expect(up?.confidence).toBeGreaterThan(0);
    expect(up?.confidence).toBeLessThanOrEqual(0.9);
  });

  it("plusieurs 'trop dur'/'bloqué' -> DIFFICULTY_MOMENTUM_DOWN et DECOMPOSITION_NEED, jamais MOMENTUM_UP en même temps", () => {
    const hard1 = episode({ id: "h1", action: "TOO_HARD" });
    const hard2 = episode({ id: "h2", action: "TOO_HARD" });
    const blocked1 = episode({ id: "b1", action: "BLOCKED" });
    const insights = deriveStrategyInsights({ episodes: [hard1, hard2, blocked1], memories: [] });

    expect(insights.some((i) => i.type === "DIFFICULTY_MOMENTUM_DOWN")).toBe(true);
    expect(insights.some((i) => i.type === "DECOMPOSITION_NEED")).toBe(true);
    expect(insights.some((i) => i.type === "DIFFICULTY_MOMENTUM_UP")).toBe(false);
  });

  it("propage le goalId fourni sur tous les insights produits (Goal Memory <-> Strategy Memory cohérents)", () => {
    const insights = deriveStrategyInsights({
      goalId: "goal-42",
      episodes: [episode({ action: "TOO_HARD" }), episode({ action: "TOO_HARD" }), episode({ action: "BLOCKED" })],
      memories: [],
    });
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) expect(insight.goalId).toBe("goal-42");
  });

  it("fait remonter une mémoire sémantique à confiance suffisante comme insight, avec son propre ID en evidence", () => {
    const memory: MemorySnapshot = { id: "mem-1", type: "DURATION_PREFERENCE", content: "Préfère les tâches courtes.", confidence: 0.7 };
    const insights = deriveStrategyInsights({ episodes: [], memories: [memory] });
    const passthrough = insights.find((i) => i.type === "MEMORY_DURATION_PREFERENCE");
    expect(passthrough).toEqual({
      type: "MEMORY_DURATION_PREFERENCE",
      content: memory.content,
      confidence: 0.7,
      goalId: undefined,
      evidenceIds: ["mem-1"],
    });
  });

  it("ignore une mémoire à confiance trop faible (pas encore assez d'observations pour en faire une stratégie)", () => {
    const weak: MemorySnapshot = { id: "mem-weak", type: "TIMING_PREFERENCE", content: "...", confidence: 0.3 };
    const insights = deriveStrategyInsights({ episodes: [], memories: [weak] });
    expect(insights).toEqual([]);
  });

  it("jamais d'evidenceIds vide sur un insight produit à partir d'épisodes (toujours fondé sur des données réelles)", () => {
    const insights = deriveStrategyInsights({
      episodes: [episode({ id: "a", action: "TOO_EASY" }), episode({ id: "b", action: "TOO_EASY" }), episode({ id: "c", action: "TOO_EASY" })],
      memories: [],
    });
    for (const insight of insights) expect(insight.evidenceIds.length).toBeGreaterThan(0);
  });
});
