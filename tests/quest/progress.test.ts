import { describe, expect, it } from "vitest";
import { computeGoalProgress } from "@/lib/quest/progress";

describe("Personal Quest AI — computeGoalProgress", () => {
  it("un jalon DONE compte pour 100% même sans quête associée", () => {
    const progress = computeGoalProgress([{ id: "m1", weight: 1, done: true }], []);
    expect(progress).toBe(100);
  });

  it("pondère par le poids des jalons, pas par leur nombre", () => {
    const progress = computeGoalProgress(
      [
        { id: "m1", weight: 3, done: true },
        { id: "m2", weight: 1, done: false },
      ],
      []
    );
    // m1 (poids 3) fait 100%, m2 (poids 1) fait 0% -> (3*1 + 1*0) / 4 = 75%
    expect(progress).toBe(75);
  });

  it("un jalon non terminé dérive sa fraction de l'impactWeight des quêtes terminées, pas de leur nombre", () => {
    const progress = computeGoalProgress(
      [{ id: "m1", weight: 1, done: false }],
      [
        { milestoneId: "m1", impactWeight: 5, completed: true }, // le premier client
        { milestoneId: "m1", impactWeight: 1, completed: false }, // un appel
      ]
    );
    // fraction = 5 / (5+1) = 0.8333... -> 83.3%
    expect(progress).toBe(83.3);
  });

  it("jamais '1 quête = 1%' : une quête à fort impact pèse plus qu'une quête mineure", () => {
    const heavyDone = computeGoalProgress(
      [{ id: "m1", weight: 1, done: false }],
      [
        { milestoneId: "m1", impactWeight: 9, completed: true },
        { milestoneId: "m1", impactWeight: 1, completed: false },
      ]
    );
    const lightDone = computeGoalProgress(
      [{ id: "m1", weight: 1, done: false }],
      [
        { milestoneId: "m1", impactWeight: 9, completed: false },
        { milestoneId: "m1", impactWeight: 1, completed: true },
      ]
    );
    expect(heavyDone).toBeGreaterThan(lightDone);
  });

  it("aucun jalon, quêtes directement sous l'objectif -> dérive de leur impactWeight", () => {
    const progress = computeGoalProgress(
      [],
      [
        { milestoneId: null, impactWeight: 1, completed: true },
        { milestoneId: null, impactWeight: 1, completed: false },
      ]
    );
    expect(progress).toBe(50);
  });

  it("retourne 0 sans jalon ni quête", () => {
    expect(computeGoalProgress([], [])).toBe(0);
  });
});
