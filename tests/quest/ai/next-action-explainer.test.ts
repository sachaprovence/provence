import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { arbitrateNextAction, explainDeterministic } from "@/lib/quest/ai/next-action-explainer";
import { getTopCandidates, type ScorableQuest, type SelectionContext } from "@/lib/quest/scoring";
import type { UserContext } from "@/lib/quest/context-builder";

/**
 * Arbitrage borné (§4 de l'architecture validée) : le LLM ne peut expliquer
 * ou (dans des conditions strictes) départager QUE l'ensemble déjà déterminé
 * par le scoring déterministe — jamais choisir en dehors, jamais l'emporter
 * sans confiance suffisante, jamais s'appliquer hors quasi-égalité ou sans
 * contexte suffisant. Mêmes conventions de serveur HTTP local mocké que
 * `anthropic-real-mode.test.ts`.
 */

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

function makeSelectionContext(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return { availableMinutes: null, energy: null, context: null, activeQuestCount: 0, now: NOW, ...overrides };
}

const EMPTY_USER_CONTEXT: UserContext = {
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

const RICH_USER_CONTEXT: UserContext = {
  ...EMPTY_USER_CONTEXT,
  strategyInsights: [
    { type: "DIFFICULTY_MOMENTUM_DOWN", content: "Rencontre des difficultés récentes.", confidence: 0.7, evidenceIds: ["f1", "f2"] },
  ],
};

function anthropicResponse(jsonPayload: unknown) {
  return { model: "claude-sonnet-5", content: [{ type: "text", text: JSON.stringify(jsonPayload) }] };
}

describe("Personal Quest AI — arbitrage borné du Next Best Action", () => {
  it("explainDeterministic : reflète toujours le candidat #1, jamais un appel réseau", () => {
    const top = getTopCandidates(
      [makeQuest({ id: "a", priority: 1, impactWeight: 3 }), makeQuest({ id: "b", priority: 5, impactWeight: 0.2 })],
      makeSelectionContext(),
      3
    );
    const result = explainDeterministic(top);
    expect(result.selectedQuestId).toBe("a");
    expect(result.confidence).toBe(1);
  });

  describe("mode réel (serveur HTTP local mocké)", () => {
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

    it("un seul candidat éligible : jamais d'appel réseau, résultat déterministe direct", async () => {
      const top = getTopCandidates([makeQuest({ id: "only" })], makeSelectionContext(), 3);
      const result = await arbitrateNextAction({ top, context: RICH_USER_CONTEXT });
      expect(result.selectedQuestId).toBe("only");
      expect(requestBodies).toHaveLength(0);
    });

    it("scores nettement séparés (pas de quasi-égalité) : jamais d'appel réseau, le #1 déterministe l'emporte", async () => {
      const top = getTopCandidates(
        [makeQuest({ id: "clear-winner", priority: 1, impactWeight: 5 }), makeQuest({ id: "far-behind", priority: 5, impactWeight: 0.1 })],
        makeSelectionContext(),
        3
      );
      const result = await arbitrateNextAction({ top, context: RICH_USER_CONTEXT });
      expect(result.selectedQuestId).toBe("clear-winner");
      expect(requestBodies).toHaveLength(0);
    });

    it("quasi-égalité mais contexte insuffisant : jamais d'appel réseau, le #1 déterministe l'emporte", async () => {
      const top = getTopCandidates(
        [makeQuest({ id: "a", createdAt: NOW }), makeQuest({ id: "b", createdAt: new Date(NOW.getTime() + 1000) })],
        makeSelectionContext(),
        3
      );
      const result = await arbitrateNextAction({ top, context: EMPTY_USER_CONTEXT });
      expect(result.selectedQuestId).toBe(top[0].quest.id);
      expect(requestBodies).toHaveLength(0);
    });

    it("quasi-égalité + contexte suffisant + confiance haute + id éligible : le LLM peut départager vers le #2", async () => {
      const top = getTopCandidates(
        [makeQuest({ id: "a", createdAt: NOW }), makeQuest({ id: "b", createdAt: new Date(NOW.getTime() + 1000) })],
        makeSelectionContext(),
        3
      );
      const runnerUp = top[1].quest.id;
      responseQueue.push({
        status: 200,
        body: anthropicResponse({ selectedQuestId: runnerUp, reason: "Correspond mieux au contexte récent.", confidence: 0.9, contextFactorsUsed: ["difficulté récente"] }),
      });

      const result = await arbitrateNextAction({ top, context: RICH_USER_CONTEXT });
      expect(result.selectedQuestId).toBe(runnerUp);
      expect(requestBodies).toHaveLength(1);
    });

    it("confiance sous le seuil : ne dévie jamais du #1 déterministe malgré une réponse LLM valide", async () => {
      const top = getTopCandidates(
        [makeQuest({ id: "a", createdAt: NOW }), makeQuest({ id: "b", createdAt: new Date(NOW.getTime() + 1000) })],
        makeSelectionContext(),
        3
      );
      const runnerUp = top[1].quest.id;
      responseQueue.push({
        status: 200,
        body: anthropicResponse({ selectedQuestId: runnerUp, reason: "Peut-être meilleur.", confidence: 0.5, contextFactorsUsed: [] }),
      });

      const result = await arbitrateNextAction({ top, context: RICH_USER_CONTEXT });
      expect(result.selectedQuestId).toBe(top[0].quest.id);
    });

    it("id hors de l'ensemble pré-filtré : jamais accepté, quelle que soit la confiance annoncée", async () => {
      const top = getTopCandidates(
        [makeQuest({ id: "a", createdAt: NOW }), makeQuest({ id: "b", createdAt: new Date(NOW.getTime() + 1000) })],
        makeSelectionContext(),
        3
      );
      responseQueue.push({
        status: 200,
        body: anthropicResponse({ selectedQuestId: "quest-not-in-candidate-set", reason: "Hallucination.", confidence: 0.99, contextFactorsUsed: [] }),
      });

      const result = await arbitrateNextAction({ top, context: RICH_USER_CONTEXT });
      expect(result.selectedQuestId).toBe(top[0].quest.id);
    });

    it("échec réseau/HTTP du LLM : fail-open silencieux vers le résultat déterministe, jamais une erreur utilisateur", async () => {
      const top = getTopCandidates(
        [makeQuest({ id: "a", createdAt: NOW }), makeQuest({ id: "b", createdAt: new Date(NOW.getTime() + 1000) })],
        makeSelectionContext(),
        3
      );
      responseQueue.push({ status: 500, body: { error: "internal error" } });

      const result = await arbitrateNextAction({ top, context: RICH_USER_CONTEXT });
      expect(result.selectedQuestId).toBe(top[0].quest.id);
    });

    it("réponse LLM invalide (viole le schéma Zod) : fail-open vers le résultat déterministe", async () => {
      const top = getTopCandidates(
        [makeQuest({ id: "a", createdAt: NOW }), makeQuest({ id: "b", createdAt: new Date(NOW.getTime() + 1000) })],
        makeSelectionContext(),
        3
      );
      responseQueue.push({ status: 200, body: anthropicResponse({ selectedQuestId: 123, reason: "x", confidence: "haute" }) });

      const result = await arbitrateNextAction({ top, context: RICH_USER_CONTEXT });
      expect(result.selectedQuestId).toBe(top[0].quest.id);
    });
  });
});
