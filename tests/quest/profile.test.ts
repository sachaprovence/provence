import { describe, expect, it } from "vitest";
import { computeUserProfile, type ProfileInputs } from "@/lib/quest/profile";

function baseInputs(overrides: Partial<ProfileInputs> = {}): ProfileInputs {
  return {
    constanceScore: 50,
    challengeScore: 40,
    deepBossCompleted: 0,
    deepBossFailed: 0,
    durationPreferenceConfidence: null,
    timeOfDayMajority: null,
    assistantMessageCount: 0,
    completedCount: 0,
    ...overrides,
  };
}

describe("Personal Quest AI — computeUserProfile (Dynamic User Model)", () => {
  it("regularityScore dérive directement de constanceScore (pas de double calcul)", () => {
    expect(computeUserProfile(baseInputs({ constanceScore: 80 })).regularityScore).toBe(0.8);
    expect(computeUserProfile(baseInputs({ constanceScore: 0 })).regularityScore).toBe(0);
  });

  it("difficultyTolerance dérive directement de challengeScore, jamais recalculé indépendamment", () => {
    expect(computeUserProfile(baseInputs({ challengeScore: 70 })).difficultyTolerance).toBe(0.7);
  });

  it("enduranceScore neutre (0.5) sans historique DEEP/BOSS, sinon ratio réussite/échec", () => {
    expect(computeUserProfile(baseInputs()).enduranceScore).toBe(0.5);
    expect(computeUserProfile(baseInputs({ deepBossCompleted: 8, deepBossFailed: 2 })).enduranceScore).toBe(0.8);
    expect(computeUserProfile(baseInputs({ deepBossCompleted: 1, deepBossFailed: 9 })).enduranceScore).toBe(0.1);
  });

  it("shortTaskPreference reprend la confiance de la mémoire DURATION_PREFERENCE si elle existe, sinon neutre", () => {
    expect(computeUserProfile(baseInputs()).shortTaskPreference).toBe(0.5);
    expect(computeUserProfile(baseInputs({ durationPreferenceConfidence: 0.72 })).shortTaskPreference).toBe(0.72);
  });

  it("effectiveHours reflète le créneau majoritaire détecté, vide si aucun ne se détache", () => {
    expect(computeUserProfile(baseInputs()).effectiveHours).toEqual([]);
    expect(computeUserProfile(baseInputs({ timeOfDayMajority: { bucket: "morning", ratio: 0.8 } })).effectiveHours).toEqual(["morning"]);
  });

  it("autonomyScore baisse quand l'utilisateur sollicite beaucoup l'assistant relativement à ce qu'il termine", () => {
    const autonomous = computeUserProfile(baseInputs({ completedCount: 10, assistantMessageCount: 0 })).autonomyScore;
    const dependent = computeUserProfile(baseInputs({ completedCount: 10, assistantMessageCount: 15 })).autonomyScore;
    expect(autonomous).toBeGreaterThan(dependent);
    expect(dependent).toBeGreaterThanOrEqual(0);
  });

  it("actionStyle : régulier + tâches courtes -> 'regulier-court' ; sporadique -> 'sporadique'", () => {
    expect(
      computeUserProfile(baseInputs({ constanceScore: 80, durationPreferenceConfidence: 0.7 })).actionStyle
    ).toBe("regulier-court");
    expect(computeUserProfile(baseInputs({ constanceScore: 10 })).actionStyle).toBe("sporadique");
  });

  it("toutes les sorties restent bornées [0,1] même avec des entrées extrêmes", () => {
    const output = computeUserProfile(
      baseInputs({ constanceScore: 1000, challengeScore: 1000, deepBossCompleted: 1000, deepBossFailed: 0, assistantMessageCount: 1000, completedCount: 1 })
    );
    expect(output.regularityScore).toBeLessThanOrEqual(1);
    expect(output.difficultyTolerance).toBeLessThanOrEqual(1);
    expect(output.enduranceScore).toBeLessThanOrEqual(1);
    expect(output.autonomyScore).toBeGreaterThanOrEqual(0);
  });
});
