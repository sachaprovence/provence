import { describe, expect, it } from "vitest";
import { runningDomain } from "@/lib/quest/ai/domains/running";

const TITLE = "Courir 1h à 10 km/h";

describe("Personal Quest AI — domaine RUNNING", () => {
  it("reconnaît l'objectif de référence", () => {
    expect(runningDomain.matches(TITLE, null)).toBe(true);
  });

  it("ne connaît pas le niveau au départ -> pose UNE question ciblée sur le niveau, pas plusieurs", () => {
    expect(runningDomain.hasEnoughInfo(TITLE, null, null)).toBe(false);
    const question = runningDomain.levelQuestion(TITLE, null);
    expect(question).toMatch(/combien de temps.*courir/i);
  });

  it("« je cours déjà 30 minutes » dans la description -> niveau déjà connu, ne redemande jamais", () => {
    const description = "Je cours déjà 30 minutes sans m'arrêter, je veux passer à l'heure complète.";
    expect(runningDomain.hasEnoughInfo(TITLE, description, null)).toBe(true);
  });

  it("une réponse « 5 minutes » à la question de niveau ne propose jamais un premier palier de 30 minutes", () => {
    const currentState = runningDomain.parseLevelAnswer(TITLE, null, "Je peux courir environ 5 minutes sans m'arrêter.");
    const milestones = runningDomain.buildMilestones({ title: TITLE, description: null, currentStateText: currentState });
    expect(milestones[0].title).toMatch(/5 minutes/);
    // §"ne jamais lui proposer une quête débutant de 5 minutes" quand le niveau est DÉJÀ élevé — ici l'inverse est vrai aussi :
    // avec un niveau bas connu (5 min), le premier palier doit rester à son niveau réel, pas sauter à un niveau avancé.
    expect(milestones[0].title).not.toMatch(/60 minutes|30 minutes/);
  });

  it("une quête de premier palier (débutant, 5 minutes) est concrète et non générique", () => {
    const currentState = runningDomain.parseLevelAnswer(TITLE, null, "5 minutes");
    const milestones = runningDomain.buildMilestones({ title: TITLE, description: null, currentStateText: currentState });
    const quests = runningDomain.buildQuestsForMilestone({ title: TITLE, description: null, currentStateText: currentState }, { title: milestones[0].title, order: 0 }, 1);
    expect(quests).toHaveLength(1);
    expect(quests[0].title).toMatch(/cours\s+5 minutes.*allure confortable.*sans t'arrêter/i);
    expect(quests[0].title).not.toMatch(/définis|décris en une phrase|liste 3 signes|première action réelle/i);
  });

  it('"trop facile" sur une quête de 5 minutes -> augmente vers 8 (dans la fourchette 8-10 minutes demandée)', () => {
    const adjusted = runningDomain.adjustQuest("Cours 5 minutes à allure confortable, sans t'arrêter.", "HARDER");
    const minutes = adjusted.title.match(/(\d+)\s*minutes?/)?.[1];
    expect(Number(minutes)).toBeGreaterThanOrEqual(8);
    expect(Number(minutes)).toBeLessThanOrEqual(10);
  });

  it('"trop difficile" sur une quête de 5 minutes -> propose exactement 5 x (1 min course + 1 min marche)', () => {
    const adjusted = runningDomain.adjustQuest("Cours 5 minutes à allure confortable, sans t'arrêter.", "EASIER");
    expect(adjusted.title).toBe("Fais 5 x (1 minute de course + 1 minute de marche), pour un total de 10 minutes.");
    expect(adjusted.difficulty).toBe(1);
  });

  it("la quête du palier final mentionne l'allure cible (10 km/h)", () => {
    const currentState = runningDomain.parseLevelAnswer(TITLE, null, "55 minutes"); // proche de la cible
    const milestones = runningDomain.buildMilestones({ title: TITLE, description: null, currentStateText: currentState });
    const lastMilestone = milestones[milestones.length - 1];
    expect(lastMilestone.title).toMatch(/60 minutes.*10 km\/h/);
    const quests = runningDomain.buildQuestsForMilestone(
      { title: TITLE, description: null, currentStateText: currentState },
      { title: lastMilestone.title, order: milestones.length - 1 },
      1
    );
    expect(quests[0].title).toMatch(/10 km\/h/);
  });
});
