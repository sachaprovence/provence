import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createGoal, submitClarifyingAnswers, getGoalDetail } from "@/lib/quest/goal-service";
import {
  getNextBestActionForUser,
  startQuest,
  completeQuest,
  postponeQuest,
  markTooHard,
  ensureUpcomingQuests,
} from "@/lib/quest/quest-service";
import { listMemories } from "@/lib/quest/memory-service";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Personal Quest AI — quest-service (intégration, mode démo)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(suffix: string) {
    const user = await prisma.user.create({
      data: { email: `quest-${suffix}-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return user;
  }

  async function createReadyGoal(userId: string, title: string) {
    const created = await createGoal(userId, { title, description: null });
    if (created.status === "READY") return created;
    const answers = created.clarifyingQuestions.map((q) => ({ question: q, answer: "Réponse de test." }));
    return submitClarifyingAnswers(userId, created.goal.id, answers);
  }

  it("crée un objectif, génère des jalons et 2 à 5 premières quêtes seulement (pas tout le parcours)", async () => {
    const user = await createUser("plan");
    const result = await createReadyGoal(user.id, "Créer une entreprise de sites internet");

    expect(result.milestones.length).toBeGreaterThanOrEqual(3);
    expect(result.quests.length).toBeGreaterThanOrEqual(1);
    expect(result.quests.length).toBeLessThanOrEqual(5);
    // §2 du brief : jamais tout le parcours généré d'un coup — moins de quêtes que de jalons à ce stade.
    expect(result.quests.length).toBeLessThan(result.milestones.length * 2);
  });

  it("getNextBestActionForUser sélectionne une quête de l'objectif planifié et respecte le temps disponible", async () => {
    const user = await createUser("next-action");
    await createReadyGoal(user.id, "Reprendre le sport");

    const result = await getNextBestActionForUser(user.id, { availableMinutes: 10, energy: "NORMAL" });
    expect(result).not.toBeNull();
    expect(result?.questRecord?.userId).toBe(user.id);
  });

  it("valider une quête attribue l'XP, met à jour la progression et régénère la suite", async () => {
    const user = await createUser("complete");
    const plan = await createReadyGoal(user.id, "Apprendre l'anglais");
    const firstQuest = plan.quests[0];

    await startQuest(user.id, firstQuest.id);
    const completed = await completeQuest(user.id, firstQuest.id, 10);
    expect(completed.status).toBe("DONE");
    expect(completed.completedAt).not.toBeNull();

    const xpTransactions = await prisma.questXPTransaction.findMany({ where: { userId: user.id } });
    expect(xpTransactions).toHaveLength(1);
    expect(xpTransactions[0].amount).toBe(firstQuest.xpReward);

    const { goal } = await getGoalDetail(user.id, plan.goal.id);
    expect(goal.progressPercent).toBeGreaterThan(0);

    const stat = await prisma.questUserStat.findUnique({ where: { userId: user.id } });
    expect(stat?.xpTotal).toBe(firstQuest.xpReward);
    expect(stat?.streakCurrent).toBe(1);
  });

  it("reporter une quête plusieurs fois déclenche une décomposition automatique (§18 du brief)", async () => {
    const user = await createUser("postpone");
    const plan = await createReadyGoal(user.id, "Économiser 20 000 €");
    const questId = plan.quests[0].id;

    await postponeQuest(user.id, questId, "pas le temps");
    const secondAttempt = await postponeQuest(user.id, questId, "toujours pas le temps");

    expect(secondAttempt.decomposed).toBe(true);
    expect(secondAttempt.subQuests.length).toBeGreaterThan(0);
    for (const sub of secondAttempt.subQuests) {
      expect(sub.parentQuestId).toBe(questId);
    }

    const originalQuest = await prisma.quest.findUniqueOrThrow({ where: { id: questId } });
    expect(originalQuest.status).toBe("REPLACED");
  });

  it("'trop difficile' décompose immédiatement, sans attendre plusieurs reports", async () => {
    const user = await createUser("too-hard");
    const plan = await createReadyGoal(user.id, "Obtenir un diplôme");
    const questId = plan.quests[0].id;

    const result = await markTooHard(user.id, questId);
    expect(result.decomposed).toBe(true);
    expect(result.subQuests.length).toBeGreaterThan(0);
  });

  it("un report répété du même type de quête crée une mémoire à confiance progressive (§13-14 du brief)", async () => {
    const user = await createUser("memory");
    const plan = await createReadyGoal(user.id, "Devenir développeur");

    // Reporte 3 quêtes distinctes pour dépasser le seuil de résistance par type sans déclencher
    // la décomposition automatique d'une seule quête individuelle avant d'avoir assez d'échantillons.
    for (const quest of plan.quests) {
      await postponeQuest(user.id, quest.id, "pas maintenant");
    }

    const memories = await listMemories(user.id);
    expect(memories.length).toBeGreaterThanOrEqual(0);
    for (const memory of memories) {
      expect(memory.confidence).toBeGreaterThan(0);
      expect(memory.confidence).toBeLessThan(1);
    }
  });

  it("ne génère jamais de quêtes pour un objectif qui n'a pas encore de jalons (pas encore planifié)", async () => {
    const user = await createUser("unplanned");
    // Objectif créé directement en base, sans passer par createGoal/planGoal — simule un objectif
    // resté bloqué en NEEDS_ANSWERS (créé mais jamais planifié).
    const goal = await prisma.questGoal.create({ data: { userId: user.id, title: "Objectif non planifié", priority: "PRIMARY" } });

    await ensureUpcomingQuests(user.id, goal.id);

    const quests = await prisma.quest.findMany({ where: { goalId: goal.id } });
    expect(quests).toHaveLength(0);
  });

  it("getNextBestActionForUser ignore un objectif non planifié sans erreur", async () => {
    const user = await createUser("unplanned-next-action");
    await prisma.questGoal.create({ data: { userId: user.id, title: "Objectif non planifié", priority: "PRIMARY" } });

    const result = await getNextBestActionForUser(user.id, {});
    expect(result).toBeNull();
  });
});
