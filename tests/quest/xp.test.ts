import { describe, expect, it } from "vitest";
import { computeXpReward, computeLevelProgress, xpRequiredForLevel } from "@/lib/quest/xp";

describe("Personal Quest AI — computeXpReward", () => {
  it("applique la base par type à difficulté par défaut (3 -> x1)", () => {
    expect(computeXpReward({ type: "MICRO", difficulty: 3 })).toBe(10);
    expect(computeXpReward({ type: "SHORT", difficulty: 3 })).toBe(20);
    expect(computeXpReward({ type: "NORMAL", difficulty: 3 })).toBe(40);
    expect(computeXpReward({ type: "DEEP", difficulty: 3 })).toBe(80);
  });

  it("applique un multiplicateur léger selon la difficulté réelle", () => {
    expect(computeXpReward({ type: "NORMAL", difficulty: 1 })).toBe(32); // 40 * 0.8
    expect(computeXpReward({ type: "NORMAL", difficulty: 5 })).toBe(48); // 40 * 1.2
  });

  it("met à l'échelle les BOSS par impactWeight, plafonné à 500", () => {
    expect(computeXpReward({ type: "BOSS", difficulty: 3, impactWeight: 1 })).toBe(150);
    expect(computeXpReward({ type: "BOSS", difficulty: 5, impactWeight: 3 })).toBe(500); // 150*1.2*3 = 540 -> plafonné
    expect(computeXpReward({ type: "BOSS", difficulty: 3, impactWeight: 10 })).toBe(450); // impact clampé à 3x
  });
});

describe("Personal Quest AI — niveaux", () => {
  it("le niveau 1 démarre à 0 XP", () => {
    const progress = computeLevelProgress(0);
    expect(progress.level).toBe(1);
    expect(progress.xpIntoLevel).toBe(0);
  });

  it("monte de niveau exactement au seuil requis", () => {
    const required = xpRequiredForLevel(1);
    const progress = computeLevelProgress(required);
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(0);
  });

  it("la XP requise croît avec le niveau (courbe supra-linéaire)", () => {
    expect(xpRequiredForLevel(2)).toBeGreaterThan(xpRequiredForLevel(1));
    expect(xpRequiredForLevel(10)).toBeGreaterThan(xpRequiredForLevel(9) * 1.1);
  });

  it("ne descend jamais sous le niveau 1 même à XP négative/nulle", () => {
    expect(computeLevelProgress(-50).level).toBe(1);
  });
});
