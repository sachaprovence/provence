import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeGoal } from "@/lib/quest/ai/goal-analyzer";
import { planGoal } from "@/lib/quest/ai/goal-planner";
import { generateQuests } from "@/lib/quest/ai/quest-generator";
import { runAssistantTurn } from "@/lib/quest/ai/assistant";
import type { UserContext } from "@/lib/quest/context-builder";

/**
 * Preuve que le mode réel (Anthropic) fonctionne effectivement — mêmes
 * conventions que `tests/ai/anthropic-provider.test.ts` (CRM) : un vrai
 * serveur HTTP local imitant l'API Messages d'Anthropic, jamais une clé
 * payante réelle. Vérifie la plomberie (forme de la requête, validation Zod
 * de la réponse, gestion d'erreur explicite) pour goal-analyzer,
 * goal-planner, quest-generator (dont le garde-fou anti-générique) et
 * l'assistant. Ne prouve PAS la qualité des réponses de Claude en
 * conditions réelles — seulement que le code qui les consomme est correct.
 */

const EMPTY_CONTEXT: UserContext = {
  profile: {
    challengeScore: 40,
    regularityScore: 0.5,
    enduranceScore: 0.5,
    shortTaskPreference: 0.5,
    autonomyScore: 0.5,
    difficultyTolerance: 0.4,
    effectiveHours: [],
    actionStyle: "inconnu",
  },
  stat: { xpTotal: 0, level: 1, streakCurrent: 0, momentum: 0, disciplineScore: 0, constanceScore: 0 },
  activeGoals: [],
  globalMemories: [],
  goalMemories: [],
  recentEpisodes: [],
  strategyInsights: [],
};

function anthropicResponse(jsonPayload: unknown) {
  return { model: "claude-sonnet-5", content: [{ type: "text", text: JSON.stringify(jsonPayload) }] };
}

describe("Personal Quest AI — mode réel Anthropic (serveur HTTP local)", () => {
  let server: http.Server;
  let requestBodies: string[];
  let responseQueue: { status: number; body: unknown }[];

  beforeEach(async () => {
    requestBodies = [];
    responseQueue = [];
    server = http.createServer((req, res) => {
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
  });

  afterEach(async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("analyzeGoal : requête réelle envoyée, réponse structurée validée par Zod", async () => {
    responseQueue.push({
      status: 200,
      body: anthropicResponse({
        currentState: null,
        targetState: "Apprendre à jouer 3 morceaux simples à la guitare.",
        constraints: [],
        timeAvailable: null,
        deadlineHint: null,
        resources: [],
        blockers: [],
        successMetrics: [],
        clarifyingQuestions: ["As-tu déjà pratiqué un instrument de musique ?"],
        difficultyEstimate: 2,
      }),
    });

    const result = await analyzeGoal({ title: "Apprendre à jouer de la guitare", description: null, context: EMPTY_CONTEXT });

    expect(result.clarifyingQuestions).toHaveLength(1);
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toContain("Apprendre à jouer de la guitare");
  });

  it("analyzeGoal : échoue explicitement si la réponse ne respecte pas le schéma (jamais un résultat fabriqué)", async () => {
    responseQueue.push({ status: 200, body: anthropicResponse({ currentState: 42 /* devrait être string|null */ }) });
    await expect(analyzeGoal({ title: "Objectif quelconque", description: null })).rejects.toThrow(/invalide/);
  });

  it("analyzeGoal : échoue explicitement sur une réponse HTTP en erreur", async () => {
    responseQueue.push({ status: 500, body: { error: "internal error" } });
    await expect(analyzeGoal({ title: "Objectif quelconque", description: null })).rejects.toThrow();
  });

  it("planGoal : jalons structurés validés par Zod", async () => {
    responseQueue.push({
      status: 200,
      body: anthropicResponse({
        milestones: [
          { title: "Apprendre 5 accords de base", description: null, weight: 0.8 },
          { title: "Enchaîner les changements d'accords sans casser le rythme", description: null, weight: 1 },
          { title: "Jouer un premier morceau simple en entier", description: null, weight: 1.5 },
        ],
      }),
    });

    const plan = await planGoal({
      title: "Apprendre à jouer de la guitare",
      description: null,
      analysis: {
        currentState: null,
        targetState: null,
        constraints: [],
        timeAvailable: null,
        deadlineHint: null,
        resources: [],
        blockers: [],
        successMetrics: [],
        clarifyingQuestions: [],
        difficultyEstimate: 2,
      },
      context: EMPTY_CONTEXT,
    });

    expect(plan.milestones.length).toBe(3);
  });

  it("generateQuests : garde-fou anti-générique — relance une fois puis accepte une réponse propre", async () => {
    responseQueue.push({
      status: 200,
      body: anthropicResponse({ quests: [{ title: "Écris en une phrase concrète et mesurable ce que représente ton objectif.", type: "MICRO", estimatedMinutes: 10 }] }),
    });
    responseQueue.push({
      status: 200,
      body: anthropicResponse({ quests: [{ title: "Apprends l'accord de Do majeur et enchaîne-le avec Sol 10 fois d'affilée.", type: "MICRO", estimatedMinutes: 10 }] }),
    });

    const result = await generateQuests({
      goalTitle: "Apprendre à jouer de la guitare",
      goalDescription: null,
      goalCurrentState: null,
      milestone: { title: "Apprendre 5 accords de base", description: null, order: 0 },
      difficultyBand: { minDifficulty: 1, maxDifficulty: 2 },
      context: EMPTY_CONTEXT,
      count: 1,
      mode: "NEXT",
    });

    expect(requestBodies).toHaveLength(2); // premier appel générique + une relance
    expect(result.quests[0].title).toContain("Do majeur");
  });

  it("generateQuests : garde-fou anti-générique — après échec de la relance, bascule sur le handler de domaine s'il existe", async () => {
    const generic = anthropicResponse({ quests: [{ title: "Fais une première action réelle (pas une préparation) pour ton objectif.", type: "MICRO", estimatedMinutes: 10 }] });
    responseQueue.push({ status: 200, body: generic });
    responseQueue.push({ status: 200, body: generic });

    const result = await generateQuests({
      goalTitle: "Courir 1h à 10 km/h",
      goalDescription: null,
      goalCurrentState: 'Peut actuellement courir 5 minutes sans s\'arrêter.',
      milestone: { title: "Courir 5 minutes sans s'arrêter", description: null, order: 0 },
      difficultyBand: { minDifficulty: 1, maxDifficulty: 2 },
      context: EMPTY_CONTEXT,
      count: 1,
      mode: "NEXT",
    });

    expect(requestBodies).toHaveLength(2);
    // Le filet de sécurité déterministe (domaine RUNNING) a pris le relais — jamais le texte générique.
    expect(result.quests[0].title.toLowerCase()).toContain("minutes");
    expect(result.quests[0].title).not.toMatch(/première action réelle/i);
  });

  it("generateQuests : sans domaine reconnu ET réponse toujours générique après relance -> échoue explicitement (jamais un résultat générique accepté)", async () => {
    const generic = anthropicResponse({ quests: [{ title: "Définis ton objectif plus précisément.", type: "MICRO", estimatedMinutes: 10 }] });
    responseQueue.push({ status: 200, body: generic });
    responseQueue.push({ status: 200, body: generic });

    await expect(
      generateQuests({
        goalTitle: "Devenir quelqu'un de meilleur",
        goalDescription: null,
        goalCurrentState: null,
        milestone: null,
        difficultyBand: { minDifficulty: 1, maxDifficulty: 2 },
        context: EMPTY_CONTEXT,
        count: 1,
        mode: "NEXT",
      })
    ).rejects.toThrow(/toujours générique/);
  });

  it("objectif hors des 7 domaines prédéfinis : la boucle complète fonctionne sans aucun handler de domaine invoqué", async () => {
    responseQueue.push({
      status: 200,
      body: anthropicResponse({
        currentState: "Débutant complet, jamais touché un instrument.",
        targetState: "Jouer 3 morceaux simples à la guitare.",
        constraints: [],
        timeAvailable: null,
        deadlineHint: null,
        resources: [],
        blockers: [],
        successMetrics: [],
        clarifyingQuestions: [],
        difficultyEstimate: 1,
      }),
    });
    responseQueue.push({
      status: 200,
      body: anthropicResponse({
        milestones: [
          { title: "Apprendre 5 accords de base", description: null, weight: 1 },
          { title: "Enchaîner les changements d'accords sans casser le rythme", description: null, weight: 1 },
          { title: "Jouer un premier morceau simple en entier", description: null, weight: 1.5 },
        ],
      }),
    });
    responseQueue.push({
      status: 200,
      body: anthropicResponse({
        quests: [{ title: "Apprends l'accord de Do majeur et joue-le 20 fois d'affilée sans regarder tes doigts.", type: "MICRO", estimatedMinutes: 10, difficulty: 1 }],
      }),
    });

    const analysis = await analyzeGoal({ title: "Apprendre à jouer de la guitare", description: null, context: EMPTY_CONTEXT });
    expect(analysis.clarifyingQuestions).toEqual([]);

    const plan = await planGoal({ title: "Apprendre à jouer de la guitare", description: null, analysis, context: EMPTY_CONTEXT });
    expect(plan.milestones.length).toBeGreaterThan(0);

    const generation = await generateQuests({
      goalTitle: "Apprendre à jouer de la guitare",
      goalDescription: null,
      goalCurrentState: analysis.currentState,
      milestone: { title: plan.milestones[0].title, description: null, order: 0 },
      difficultyBand: { minDifficulty: 1, maxDifficulty: 2 },
      context: EMPTY_CONTEXT,
      count: 1,
      mode: "NEXT",
    });

    expect(generation.quests.length).toBe(1);
    expect(generation.quests[0].title).not.toMatch(/définis ton objectif|décris en une phrase/i);
    expect(requestBodies).toHaveLength(3); // un seul appel par étape : aucune relance nécessaire, aucun handler consulté
  });

  it("runAssistantTurn : réponse structurée (message + actions) validée par Zod", async () => {
    responseQueue.push({
      status: 200,
      body: anthropicResponse({
        message: "Je mets ton objectif en pause.",
        actions: [{ kind: "PAUSE_GOAL", goalId: "goal-1" }],
      }),
    });

    const reply = await runAssistantTurn({
      history: [],
      message: "Mets mon objectif en pause",
      context: { activeGoals: [{ id: "goal-1", title: "Test", progressPercent: 0 }], nextQuest: null, recentMemories: [], userContext: EMPTY_CONTEXT },
    });

    expect(reply.actions).toEqual([{ kind: "PAUSE_GOAL", goalId: "goal-1" }]);
  });
});
