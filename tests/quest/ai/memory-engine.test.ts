import { describe, expect, it } from "vitest";
import { deriveMemoryObservations, deriveGoalScopedMemoryObservations, nextConfidence, type FeedbackSample } from "@/lib/quest/ai/memory-engine";

const GOAL_A = "goal-a";
const GOAL_B = "goal-b";

describe("Personal Quest AI — deriveMemoryObservations", () => {
  it("un seul report n'est jamais une vérité permanente : aucune observation avant le seuil", () => {
    const samples: FeedbackSample[] = [{ action: "POSTPONED", questType: "CHALLENGE", createdAt: new Date("2026-08-01"), goalId: GOAL_A }];
    expect(deriveMemoryObservations(samples)).toEqual([]);
  });

  it("des reports répétés du même type de quête déclenchent une observation de résistance", () => {
    const samples: FeedbackSample[] = Array.from({ length: 3 }, () => ({
      action: "POSTPONED" as const,
      questType: "CHALLENGE" as const,
      createdAt: new Date("2026-08-01"),
      goalId: GOAL_A,
    }));
    const observations = deriveMemoryObservations(samples);
    expect(observations).toHaveLength(1);
    expect(observations[0].type).toBe("TASK_TYPE_RESISTANCE");
    expect(observations[0].content).toContain("challenge");
  });

  it("détecte une préférence pour les tâches courtes quand elles dominent nettement les complétions", () => {
    const samples: FeedbackSample[] = [
      ...Array.from({ length: 4 }, () => ({ action: "COMPLETED" as const, questType: "MICRO" as const, createdAt: new Date("2026-08-01T09:00:00"), goalId: GOAL_A })),
      { action: "COMPLETED" as const, questType: "DEEP" as const, createdAt: new Date("2026-08-01T09:00:00"), goalId: GOAL_A },
    ];
    const observations = deriveMemoryObservations(samples);
    expect(observations.some((o) => o.type === "DURATION_PREFERENCE")).toBe(true);
  });
});

describe("Personal Quest AI — deriveGoalScopedMemoryObservations (Goal Memory)", () => {
  it("ne détecte une résistance QUE sur l'objectif concerné, pas globalement", () => {
    const samples: FeedbackSample[] = [
      ...Array.from({ length: 3 }, () => ({ action: "POSTPONED" as const, questType: "DEEP" as const, createdAt: new Date("2026-08-01"), goalId: GOAL_A })),
      // Le même type de quête, sous un AUTRE objectif, est terminé sans problème — pas de résistance globale.
      ...Array.from({ length: 3 }, () => ({ action: "COMPLETED" as const, questType: "DEEP" as const, createdAt: new Date("2026-08-01"), goalId: GOAL_B })),
    ];

    const scopedToA = deriveGoalScopedMemoryObservations(samples, GOAL_A);
    expect(scopedToA.some((o) => o.type === "TASK_TYPE_RESISTANCE")).toBe(true);

    const scopedToB = deriveGoalScopedMemoryObservations(samples, GOAL_B);
    expect(scopedToB.some((o) => o.type === "TASK_TYPE_RESISTANCE")).toBe(false);

    // Le passage global détecte bien une résistance (3 reports au total >= seuil), mais ne dit PAS
    // à quel objectif elle est due — c'est précisément ce que le scoping par objectif apporte en plus.
    const global = deriveMemoryObservations(samples);
    expect(global.some((o) => o.type === "TASK_TYPE_RESISTANCE")).toBe(true);
  });
});

describe("Personal Quest AI — nextConfidence", () => {
  it("augmente la confiance mais jamais d'un coup à 1", () => {
    const next = nextConfidence(0.25, 1);
    expect(next).toBeGreaterThan(0.25);
    expect(next).toBeLessThan(1);
  });

  it("converge vers une asymptote (rendements décroissants) sans jamais dépasser 0.95", () => {
    let confidence = 0.25;
    for (let i = 1; i <= 20; i += 1) {
      confidence = nextConfidence(confidence, i);
    }
    expect(confidence).toBeLessThanOrEqual(0.95);
    expect(confidence).toBeGreaterThan(0.6);
  });
});
