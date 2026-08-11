import { describe, expect, it } from "vitest";
import { deriveMemoryObservations, nextConfidence, type FeedbackSample } from "@/lib/quest/ai/memory-engine";

describe("Personal Quest AI — deriveMemoryObservations", () => {
  it("un seul report n'est jamais une vérité permanente : aucune observation avant le seuil", () => {
    const samples: FeedbackSample[] = [{ action: "POSTPONED", questType: "CHALLENGE", createdAt: new Date("2026-08-01") }];
    expect(deriveMemoryObservations(samples)).toEqual([]);
  });

  it("des reports répétés du même type de quête déclenchent une observation de résistance", () => {
    const samples: FeedbackSample[] = Array.from({ length: 3 }, () => ({
      action: "POSTPONED" as const,
      questType: "CHALLENGE" as const,
      createdAt: new Date("2026-08-01"),
    }));
    const observations = deriveMemoryObservations(samples);
    expect(observations).toHaveLength(1);
    expect(observations[0].type).toBe("TASK_TYPE_RESISTANCE");
    expect(observations[0].content).toContain("challenge");
  });

  it("détecte une préférence pour les tâches courtes quand elles dominent nettement les complétions", () => {
    const samples: FeedbackSample[] = [
      ...Array.from({ length: 4 }, () => ({ action: "COMPLETED" as const, questType: "MICRO" as const, createdAt: new Date("2026-08-01T09:00:00") })),
      { action: "COMPLETED" as const, questType: "DEEP" as const, createdAt: new Date("2026-08-01T09:00:00") },
    ];
    const observations = deriveMemoryObservations(samples);
    expect(observations.some((o) => o.type === "DURATION_PREFERENCE")).toBe(true);
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
