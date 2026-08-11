import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createGoal, submitClarifyingAnswers } from "@/lib/quest/goal-service";
import { markTooHard, markTooEasy } from "@/lib/quest/quest-service";

/**
 * P0 "Adaptive Difficulty V2" — avant ce correctif, `challengeScore` était un
 * seul scalaire global (`QuestUserProfile.challengeScore`) partagé entre TOUS
 * les objectifs actifs d'un utilisateur : un échec en guitare faisait baisser
 * la difficulté des quêtes de course à pied, et réciproquement. Chaque
 * `QuestGoal` porte désormais son propre `challengeScore` (nullable, additif,
 * rétrocompatible) — un objectif ne se calibre plus que sur SES propres
 * résultats, jamais sur ceux d'un autre objectif du même utilisateur. Le
 * score global reste le point de départ raisonnable d'un objectif tout neuf
 * sans historique propre (voir `quest-service.ts#resolveGoalChallengeScore`).
 */

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function createUser(suffix: string) {
  const user = await prisma.user.create({
    data: { email: `quest-adaptive-difficulty-${suffix}-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
  });
  return user;
}

runIfDatabase("Personal Quest AI — Adaptive Difficulty V2 (challengeScore scopé par objectif)", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  it(
    "des réussites répétées sur un objectif augmentent SA difficulté sans jamais toucher un autre objectif du même utilisateur, y compris dans l'autre sens (échecs)",
    async () => {
      const user = await createUser("cross-goal");
      userIds.push(user.id);

      // Deux objectifs très différents chez le même utilisateur — exactement le scénario que ce
      // correctif doit empêcher : course à pied (va bien) + anglais (en difficulté).
      const runningCreated = await createGoal(user.id, { title: "Courir 5 kilomètres", description: null });
      if (runningCreated.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
      const runningReady = await submitClarifyingAnswers(user.id, runningCreated.goal.id, [
        { question: runningCreated.clarifyingQuestions[0], answer: "Je peux courir environ 10 minutes sans m'arrêter." },
      ]);

      const languageCreated = await createGoal(user.id, { title: "Apprendre l'anglais", description: null });
      if (languageCreated.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
      const languageReady = await submitClarifyingAnswers(user.id, languageCreated.goal.id, [
        { question: languageCreated.clarifyingQuestions[0], answer: "Je suis débutant complet." },
      ]);

      // Avant tout feedback : les deux objectifs n'ont pas encore de score propre.
      const runningBefore = await prisma.questGoal.findUniqueOrThrow({ where: { id: runningCreated.goal.id } });
      const languageBefore = await prisma.questGoal.findUniqueOrThrow({ where: { id: languageCreated.goal.id } });
      expect(runningBefore.challengeScore).toBeNull();
      expect(languageBefore.challengeScore).toBeNull();

      // Cas 1 : plusieurs signaux positifs sur "course à pied" -> SA difficulté augmente.
      let currentRunningQuestId = runningReady.quests[0].id;
      for (let i = 0; i < 3; i += 1) {
        const result = await markTooEasy(user.id, currentRunningQuestId);
        currentRunningQuestId = result.subQuests[0].id;
      }

      // Cas 3 : plusieurs signaux négatifs sur "anglais" -> SA difficulté diminue.
      let currentLanguageQuestId = languageReady.quests[0].id;
      for (let i = 0; i < 3; i += 1) {
        const result = await markTooHard(user.id, currentLanguageQuestId);
        currentLanguageQuestId = result.subQuests[0].id;
      }

      const runningAfter = await prisma.questGoal.findUniqueOrThrow({ where: { id: runningCreated.goal.id } });
      const languageAfter = await prisma.questGoal.findUniqueOrThrow({ where: { id: languageCreated.goal.id } });

      // Cas 1 : "course à pied" a bien sa propre difficulté qui a augmenté.
      expect(runningAfter.challengeScore).not.toBeNull();
      expect(runningAfter.challengeScore!).toBeGreaterThan(40);

      // Cas 3 : "anglais" a bien sa propre difficulté qui a diminué.
      expect(languageAfter.challengeScore).not.toBeNull();
      expect(languageAfter.challengeScore!).toBeLessThan(40);

      // Cas 2 et 4 (le cœur du correctif) : chaque objectif reste rigoureusement indépendant de
      // l'autre — les échecs en anglais n'ont RIEN changé à la course, et réciproquement.
      expect(runningAfter.challengeScore!).toBeGreaterThan(languageAfter.challengeScore!);
    },
    20_000
  );

  it("un objectif tout neuf, sans historique propre, retombe sur le score général de l'utilisateur (valeur initiale cohérente, y compris pour un utilisateur 'ancien' qui n'a qu'un score global)", async () => {
    const user = await createUser("fallback");
    userIds.push(user.id);

    // Simule un utilisateur "ancien" dont le score général a déjà dérivé avant ce correctif
    // (valeur différente de la valeur par défaut du schéma, 40) — le fallback doit l'utiliser
    // tel quel, sans jamais planter ni le réinitialiser arbitrairement.
    await prisma.questUserProfile.upsert({
      where: { userId: user.id },
      update: { challengeScore: 72 },
      create: { userId: user.id, challengeScore: 72 },
    });

    const created = await createGoal(user.id, { title: "Courir 5 kilomètres", description: null });
    if (created.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
    const ready = await submitClarifyingAnswers(user.id, created.goal.id, [
      { question: created.clarifyingQuestions[0], answer: "Je peux courir environ 10 minutes sans m'arrêter." },
    ]);

    // Cas 6 : aucun crash, le fallback fonctionne. Cas 5 : la valeur retenue est cohérente —
    // exactement le score général de l'utilisateur, jamais une valeur arbitraire ré-inventée.
    expect(ready.quests.length).toBeGreaterThan(0);
    expect(ready.quests[0].challengeScore).toBe(72);

    // Le goal lui-même n'a toujours pas de score propre — il n'a encore reçu aucun feedback.
    const goal = await prisma.questGoal.findUniqueOrThrow({ where: { id: created.goal.id } });
    expect(goal.challengeScore).toBeNull();
  });

  it("isolation stricte userId + goalId : l'historique d'un utilisateur ne modifie jamais le challengeScore d'un objectif d'un autre utilisateur", async () => {
    const userA = await createUser("isolation-a");
    const userB = await createUser("isolation-b");
    userIds.push(userA.id, userB.id);

    const title = "Courir 5 kilomètres";
    const answer = "Je peux courir environ 10 minutes sans m'arrêter.";

    const createdA = await createGoal(userA.id, { title, description: null });
    if (createdA.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
    const readyA = await submitClarifyingAnswers(userA.id, createdA.goal.id, [{ question: createdA.clarifyingQuestions[0], answer }]);

    const createdB = await createGoal(userB.id, { title, description: null });
    if (createdB.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
    await submitClarifyingAnswers(userB.id, createdB.goal.id, [{ question: createdB.clarifyingQuestions[0], answer }]);

    // Historique négatif intense chez A uniquement.
    let currentQuestId = readyA.quests[0].id;
    for (let i = 0; i < 3; i += 1) {
      const result = await markTooHard(userA.id, currentQuestId);
      currentQuestId = result.subQuests[0].id;
    }

    const goalA = await prisma.questGoal.findUniqueOrThrow({ where: { id: createdA.goal.id } });
    const goalB = await prisma.questGoal.findUniqueOrThrow({ where: { id: createdB.goal.id } });

    expect(goalA.challengeScore).not.toBeNull();
    expect(goalA.challengeScore!).toBeLessThan(40);
    // L'objectif de B, jamais touché, reste intact malgré un titre identique à celui de A.
    expect(goalB.challengeScore).toBeNull();
  });
});
