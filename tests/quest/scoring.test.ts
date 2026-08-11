import { describe, expect, it } from "vitest";
import { getNextBestAction, scoreQuest, type ScorableQuest, type SelectionContext } from "@/lib/quest/scoring";

const NOW = new Date("2026-08-11T12:00:00Z");

function makeQuest(overrides: Partial<ScorableQuest> = {}): ScorableQuest {
  return {
    id: "q1",
    goalPriority: "SECONDARY",
    type: "NORMAL",
    priority: 3,
    difficulty: 3,
    impactWeight: 1,
    estimatedMinutes: 30,
    deadline: null,
    context: null,
    createdAt: NOW,
    goalProgressPercent: 0,
    dependenciesMet: true,
    postponeCount: 0,
    recentFailureCount: 0,
    ...overrides,
  };
}

function makeContext(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return {
    availableMinutes: null,
    energy: null,
    context: null,
    activeQuestCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe("Personal Quest AI — getNextBestAction", () => {
  it("exclut toujours les quêtes dont les dépendances ne sont pas résolues", () => {
    const blocked = makeQuest({ id: "blocked", dependenciesMet: false, priority: 1, impactWeight: 10 });
    const free = makeQuest({ id: "free", priority: 5, impactWeight: 0.1 });
    const result = getNextBestAction([blocked, free], makeContext());
    expect(result?.quest.id).toBe("free");
  });

  it("retourne null s'il n'y a aucune candidate éligible", () => {
    const blocked = makeQuest({ dependenciesMet: false });
    expect(getNextBestAction([blocked], makeContext())).toBeNull();
  });

  it("un objectif PRIMARY est favorisé face à un objectif SECONDARY à conditions égales", () => {
    const primary = makeQuest({ id: "p", goalPriority: "PRIMARY" });
    const secondary = makeQuest({ id: "s", goalPriority: "SECONDARY" });
    const result = getNextBestAction([primary, secondary], makeContext());
    expect(result?.quest.id).toBe("p");
  });

  it("une deadline proche augmente l'urgence face à une quête sans deadline", () => {
    const urgent = makeQuest({ id: "urgent", deadline: new Date("2026-08-11T18:00:00Z") });
    const relaxed = makeQuest({ id: "relaxed", deadline: null });
    const result = getNextBestAction([urgent, relaxed], makeContext());
    expect(result?.quest.id).toBe("urgent");
  });

  it("une quête trop longue pour le temps disponible est défavorisée", () => {
    const short = makeQuest({ id: "short", estimatedMinutes: 10 });
    const long = makeQuest({ id: "long", estimatedMinutes: 90 });
    const result = getNextBestAction([short, long], makeContext({ availableMinutes: 15 }));
    expect(result?.quest.id).toBe("short");
  });

  it("une énergie basse défavorise les quêtes difficiles", () => {
    const easy = makeQuest({ id: "easy", difficulty: 1 });
    const hard = makeQuest({ id: "hard", difficulty: 5 });
    const result = getNextBestAction([easy, hard], makeContext({ energy: "LOW" }));
    expect(result?.quest.id).toBe("easy");
  });

  it("un contexte qui correspond est favorisé face à un contexte qui ne correspond pas", () => {
    const home = makeQuest({ id: "home", context: "HOME" });
    const work = makeQuest({ id: "work", context: "WORK" });
    const result = getNextBestAction([home, work], makeContext({ context: "HOME" }));
    expect(result?.quest.id).toBe("home");
  });

  it("une quête déjà reportée plusieurs fois perd du score face à une quête neuve équivalente", () => {
    const postponed = makeQuest({ id: "postponed", postponeCount: 5 });
    const fresh = makeQuest({ id: "fresh", postponeCount: 0 });
    const result = getNextBestAction([postponed, fresh], makeContext());
    expect(result?.quest.id).toBe("fresh");
  });

  it("la surcharge (plusieurs quêtes déjà actives) pénalise sans jamais rendre le score négatif", () => {
    const quest = makeQuest();
    const breakdown = scoreQuest(quest, makeContext({ activeQuestCount: 10 }));
    expect(breakdown.overloadPenalty).toBeGreaterThan(0);
    expect(breakdown.score).toBeGreaterThanOrEqual(0);
  });

  it("à score égal, départage par deadline la plus proche puis par ancienneté", () => {
    const older = makeQuest({ id: "older", createdAt: new Date("2026-08-01T00:00:00Z") });
    const newer = makeQuest({ id: "newer", createdAt: new Date("2026-08-10T00:00:00Z") });
    const result = getNextBestAction([newer, older], makeContext());
    expect(result?.quest.id).toBe("older");
  });
});
