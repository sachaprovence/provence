import http from "node:http";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createGoal, submitClarifyingAnswers } from "@/lib/quest/goal-service";
import { markTooHard, markTooEasy, generateQuestsForMilestone } from "@/lib/quest/quest-service";
import { buildUserContext, formatUserContextForPrompt } from "@/lib/quest/context-builder";

/**
 * Preuve des deux critères d'acceptation validés par l'utilisateur pour le
 * "V2 Adaptive Intelligence Core" :
 *
 * 1. Deux utilisateurs neufs, même objectif, contexte réellement identique
 *    (aucun historique) -> AUCUNE divergence artificielle (même contexte
 *    construit, même prompt).
 * 2. Deux utilisateurs, même objectif, mais un historique comportemental
 *    RÉEL suffisamment différent (jamais fabriqué pour le test — produit par
 *    les mêmes fonctions de service que la production, `markTooHard` /
 *    `markTooEasy` / `learnFromOutcome`) -> le Modèle Utilisateur Dynamique
 *    et la Mémoire de Stratégie divergent rationnellement, et cette
 *    divergence est effectivement transmise au LLM en mode réel — jamais
 *    perdue en route, jamais une règle ad hoc ajoutée pour "faire passer"
 *    ce test.
 */

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function createUser(suffix: string) {
  const user = await prisma.user.create({
    data: { email: `quest-divergence-${suffix}-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
  });
  return user;
}

function anthropicResponse(jsonPayload: unknown) {
  return { model: "claude-sonnet-5", content: [{ type: "text", text: JSON.stringify(jsonPayload) }] };
}

runIfDatabase("Personal Quest AI — divergence rationnelle de la personnalisation (V2)", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  it("contexte réellement identique (deux utilisateurs neufs) : aucune divergence artificielle du contexte construit", async () => {
    const userA = await createUser("fresh-a");
    const userB = await createUser("fresh-b");
    userIds.push(userA.id, userB.id);

    const contextA = await buildUserContext(userA.id);
    const contextB = await buildUserContext(userB.id);

    expect(contextA.profile).toEqual(contextB.profile);
    expect(contextA.stat).toEqual(contextB.stat);
    expect(contextA.strategyInsights).toEqual([]);
    expect(contextB.strategyInsights).toEqual([]);
    expect(contextA.activeGoals).toEqual([]);
    // Le texte réellement injecté dans le prompt (goutte finale de la chaîne) est identique lettre pour lettre.
    expect(formatUserContextForPrompt(contextA)).toBe(formatUserContextForPrompt(contextB));
  });

  it(
    "historique comportemental réel suffisamment différent : le challengeScore, les stratégies observées ET le prompt réel envoyé au LLM divergent rationnellement (jamais artificiellement)",
    async () => {
      const userA = await createUser("diverge-a"); // va accumuler des signaux négatifs réels (trop dur)
      const userB = await createUser("diverge-b"); // va accumuler des signaux positifs réels (trop facile)
      userIds.push(userA.id, userB.id);

      // --- Phase 1 (mode démo, aucun réseau) : construire un historique RÉEL via les mêmes
      // fonctions de service que la production, jamais une manipulation directe de la DB. ---
      delete process.env.AI_PROVIDER;

      const seedTitle = "Courir 5 kilomètres";
      const seedAnswer = "Je peux courir environ 10 minutes sans m'arrêter.";

      const seedA = await createGoal(userA.id, { title: seedTitle, description: null });
      if (seedA.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
      const readyA = await submitClarifyingAnswers(userA.id, seedA.goal.id, [{ question: seedA.clarifyingQuestions[0], answer: seedAnswer }]);
      let currentQuestIdA = readyA.quests[0].id;
      for (let i = 0; i < 3; i += 1) {
        const result = await markTooHard(userA.id, currentQuestIdA);
        currentQuestIdA = result.subQuests[0].id;
      }

      const seedB = await createGoal(userB.id, { title: seedTitle, description: null });
      if (seedB.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
      const readyB = await submitClarifyingAnswers(userB.id, seedB.goal.id, [{ question: seedB.clarifyingQuestions[0], answer: seedAnswer }]);
      let currentQuestIdB = readyB.quests[0].id;
      for (let i = 0; i < 3; i += 1) {
        const result = await markTooEasy(userB.id, currentQuestIdB);
        currentQuestIdB = result.subQuests[0].id;
      }

      const profileA = await prisma.questUserProfile.findUniqueOrThrow({ where: { userId: userA.id } });
      const profileB = await prisma.questUserProfile.findUniqueOrThrow({ where: { userId: userB.id } });

      // Divergence réelle et dans le sens attendu — jamais une valeur fabriquée.
      expect(profileA.challengeScore).toBeLessThan(40); // valeur par défaut
      expect(profileB.challengeScore).toBeGreaterThan(40);
      expect(profileA.challengeScore).toBeLessThan(profileB.challengeScore);

      const contextA = await buildUserContext(userA.id);
      const contextB = await buildUserContext(userB.id);
      expect(contextA.strategyInsights.some((i) => i.type === "DIFFICULTY_MOMENTUM_DOWN")).toBe(true);
      expect(contextB.strategyInsights.some((i) => i.type === "DIFFICULTY_MOMENTUM_UP")).toBe(true);

      // --- Phase 2 : un NOUVEL objectif, identique pour les deux (même titre, même réponse de
      // niveau) — la seule source de divergence possible ici est l'historique de la phase 1. ---
      const targetTitle = "Courir un semi-marathon";
      const targetAnswer = "Je peux courir environ 10 minutes sans m'arrêter.";

      const targetA = await createGoal(userA.id, { title: targetTitle, description: null });
      if (targetA.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
      const targetReadyA = await submitClarifyingAnswers(userA.id, targetA.goal.id, [
        { question: targetA.clarifyingQuestions[0], answer: targetAnswer },
      ]);

      const targetB = await createGoal(userB.id, { title: targetTitle, description: null });
      if (targetB.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
      const targetReadyB = await submitClarifyingAnswers(userB.id, targetB.goal.id, [
        { question: targetB.clarifyingQuestions[0], answer: targetAnswer },
      ]);

      // --- Phase 3 (mode réel Anthropic, serveur HTTP local mocké) : la seule façon de vérifier
      // que la divergence de contexte est RÉELLEMENT transmise au LLM, pas seulement calculée
      // en mémoire et jamais utilisée. ---
      const requestBodies: string[] = [];
      const responseQueue: { status: number; body: unknown }[] = [
        { status: 200, body: anthropicResponse({ quests: [{ title: "Cours 8 minutes à allure très confortable, sans t'arrêter.", type: "MICRO", estimatedMinutes: 15, difficulty: 1 }] }) },
        { status: 200, body: anthropicResponse({ quests: [{ title: "Cours 22 minutes à allure soutenue, sans t'arrêter.", type: "NORMAL", estimatedMinutes: 30, difficulty: 4 }] }) },
      ];
      const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          requestBodies.push(body);
          const next = responseQueue.shift() ?? { status: 500, body: { error: "no mocked response queued" } };
          res.writeHead(next.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(next.body));
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as AddressInfo).port;
      process.env.AI_PROVIDER = "anthropic";
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;

      try {
        await generateQuestsForMilestone(userA.id, targetReadyA.goal, targetReadyA.milestones[0]);
        await generateQuestsForMilestone(userB.id, targetReadyB.goal, targetReadyB.milestones[0]);
      } finally {
        delete process.env.AI_PROVIDER;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_BASE_URL;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }

      expect(requestBodies).toHaveLength(2);
      const [bodyA, bodyB] = requestBodies;

      // La partie qui doit diverger diverge réellement, dans le sens rationnel attendu.
      expect(bodyA).toContain("entre 1 et 1");
      expect(bodyB).toContain("entre 3 et 4");
      expect(bodyA).toContain("Rencontre des difficultés récentes");
      expect(bodyB).toContain("Progresse bien récemment");
      expect(bodyA).not.toContain("Progresse bien récemment");
      expect(bodyB).not.toContain("Rencontre des difficultés récentes");

      // La partie qui n'a AUCUNE raison de diverger (même objectif, même niveau déclaré) ne diverge pas.
      expect(bodyA).toContain(targetTitle);
      expect(bodyB).toContain(targetTitle);
      expect(bodyA).toContain("RUNNING");
      expect(bodyB).toContain("RUNNING");
    },
    20_000
  );
});
