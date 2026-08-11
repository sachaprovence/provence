import { describe, expect, it } from "vitest";
import { computeStreaks, computeDisciplineScore, computeConstanceScore, computeMomentum, momentumLabel } from "@/lib/quest/momentum";

describe("Personal Quest AI — computeStreaks", () => {
  it("streak courant de 3 jours consécutifs jusqu'à aujourd'hui", () => {
    const result = computeStreaks(["2026-08-09", "2026-08-10", "2026-08-11"], "2026-08-11");
    expect(result.current).toBe(3);
    expect(result.best).toBe(3);
  });

  it("le streak reste vivant si la dernière activité était hier (pas encore cassé aujourd'hui)", () => {
    const result = computeStreaks(["2026-08-09", "2026-08-10"], "2026-08-11");
    expect(result.current).toBe(2);
  });

  it("le streak est cassé après 2 jours sans activité", () => {
    const result = computeStreaks(["2026-08-05", "2026-08-06"], "2026-08-11");
    expect(result.current).toBe(0);
    expect(result.best).toBe(2);
  });

  it("garde le meilleur streak historique même si le streak courant est retombé", () => {
    const result = computeStreaks(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-11"], "2026-08-11");
    expect(result.best).toBe(4);
    expect(result.current).toBe(1);
  });

  it("aucune activité -> 0/0", () => {
    expect(computeStreaks([], "2026-08-11")).toEqual({ current: 0, best: 0 });
  });
});

describe("Personal Quest AI — computeDisciplineScore", () => {
  it("100% de complétion et régularité totale -> score maximal", () => {
    const score = computeDisciplineScore({
      completedCount: 7,
      postponedCount: 0,
      blockedCount: 0,
      abandonedCount: 0,
      activeDaysCount: 7,
      windowDays: 7,
    });
    expect(score).toBe(100);
  });

  it("beaucoup de reports abaisse le score même avec quelques complétions", () => {
    const score = computeDisciplineScore({
      completedCount: 1,
      postponedCount: 6,
      blockedCount: 0,
      abandonedCount: 0,
      activeDaysCount: 1,
      windowDays: 7,
    });
    expect(score).toBeLessThan(30);
  });
});

describe("Personal Quest AI — computeConstanceScore", () => {
  it("pénalise l'inactivité récente progressivement, pas brutalement", () => {
    const fresh = computeConstanceScore({ activeDays30: 20, streakCurrent: 5, daysSinceLastActive: 0 });
    const stale = computeConstanceScore({ activeDays30: 20, streakCurrent: 5, daysSinceLastActive: 5 });
    const veryStale = computeConstanceScore({ activeDays30: 20, streakCurrent: 5, daysSinceLastActive: 20 });
    expect(fresh).toBeGreaterThan(stale);
    expect(stale).toBeGreaterThan(veryStale);
    expect(veryStale).toBeGreaterThan(0); // jamais 0 brutalement (regularity30/streak restent comptés)
  });
});

describe("Personal Quest AI — computeMomentum / momentumLabel", () => {
  it("forte activité récente -> momentum élevé, label 'tres_forte_dynamique'", () => {
    const momentum = computeMomentum({
      completedLast7: 10,
      activeDays7: 6,
      postponedLast7: 0,
      streakCurrent: 10,
      daysSinceLastActive: 0,
    });
    expect(momentum).toBeGreaterThan(70);
    expect(momentumLabel(momentum)).toBe("tres_forte_dynamique");
  });

  it("aucune activité récente -> momentum proche de 0, label 'aucune_activite'", () => {
    const momentum = computeMomentum({
      completedLast7: 0,
      activeDays7: 0,
      postponedLast7: 0,
      streakCurrent: 0,
      daysSinceLastActive: 15,
    });
    expect(momentum).toBeLessThanOrEqual(5);
    expect(momentumLabel(momentum)).toBe("aucune_activite");
  });

  it("ne descend jamais sous 0 ni au-dessus de 100", () => {
    const low = computeMomentum({ completedLast7: 0, activeDays7: 0, postponedLast7: 20, streakCurrent: 0, daysSinceLastActive: 30 });
    const high = computeMomentum({ completedLast7: 50, activeDays7: 7, postponedLast7: 0, streakCurrent: 100, daysSinceLastActive: 0 });
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(100);
  });
});
