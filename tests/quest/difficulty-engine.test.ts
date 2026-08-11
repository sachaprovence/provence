import { describe, expect, it } from "vitest";
import { adjustChallengeScore, challengeScoreToDifficultyBand } from "@/lib/quest/difficulty-engine";

const NO_SIGNAL = { completedSmoothlyCount: 0, tooEasyCount: 0, tooHardCount: 0, abandonedOrBlockedCount: 0, postponedCount: 0 };

describe("Personal Quest AI — adjustChallengeScore", () => {
  it("une seule quête trop facile n'explose pas le score (ajustement par petits pas)", () => {
    const next = adjustChallengeScore(40, { ...NO_SIGNAL, tooEasyCount: 1 });
    expect(next).toBe(44);
  });

  it("des abandons répétés réduisent nettement le challenge", () => {
    const next = adjustChallengeScore(50, { ...NO_SIGNAL, abandonedOrBlockedCount: 3 });
    expect(next).toBe(26);
  });

  it("des complétions fluides répétées, sans signal négatif, augmentent doucement le challenge", () => {
    const next = adjustChallengeScore(50, { ...NO_SIGNAL, completedSmoothlyCount: 4 });
    expect(next).toBe(53);
  });

  it("une réussite ne compense pas un abandon le même cycle (pas de +3 si signal négatif présent)", () => {
    const next = adjustChallengeScore(50, { ...NO_SIGNAL, completedSmoothlyCount: 4, tooHardCount: 1 });
    expect(next).toBe(44); // -6 (tooHard) seulement, pas de bonus +3
  });

  it("reste toujours dans les bornes [1, 100]", () => {
    expect(adjustChallengeScore(2, { ...NO_SIGNAL, abandonedOrBlockedCount: 5 })).toBeGreaterThanOrEqual(1);
    expect(adjustChallengeScore(99, { ...NO_SIGNAL, tooEasyCount: 20 })).toBeLessThanOrEqual(100);
  });
});

describe("Personal Quest AI — challengeScoreToDifficultyBand", () => {
  it("un challengeScore faible cible une difficulté basse", () => {
    expect(challengeScoreToDifficultyBand(10)).toEqual({ minDifficulty: 1, maxDifficulty: 1 });
  });

  it("un challengeScore élevé cible une difficulté haute", () => {
    expect(challengeScoreToDifficultyBand(95)).toEqual({ minDifficulty: 4, maxDifficulty: 5 });
  });
});
