import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { runAssistantTurn } from "@/lib/quest/ai/assistant";
import type { UserContext } from "@/lib/quest/context-builder";

const NEXT_QUEST = { id: "q1", title: "Appeler un prospect", estimatedMinutes: 20, difficulty: 3 };
const GOAL = { id: "g1", title: "Créer mon entreprise", progressPercent: 42 };

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

describe("Personal Quest AI — assistant (mode démo)", () => {
  const previousProvider = process.env.AI_PROVIDER;
  beforeEach(() => {
    process.env.AI_PROVIDER = "demo";
  });
  afterEach(() => {
    process.env.AI_PROVIDER = previousProvider;
  });

  it("détecte un blocage (avec accent) et propose de décomposer la prochaine quête", async () => {
    const reply = await runAssistantTurn({
      history: [],
      message: "Cette quête est trop compliquée, je suis bloqué",
      context: { activeGoals: [GOAL], nextQuest: NEXT_QUEST, recentMemories: [], userContext: EMPTY_USER_CONTEXT },
    });
    expect(reply.actions).toEqual([{ kind: "DECOMPOSE_QUEST", questId: "q1" }]);
  });

  it("détecte une demande de pause et résout le bon objectif par son titre", async () => {
    const reply = await runAssistantTurn({
      history: [],
      message: "Mets en pause mon objectif Créer mon entreprise",
      context: { activeGoals: [GOAL], nextQuest: NEXT_QUEST, recentMemories: [], userContext: EMPTY_USER_CONTEXT },
    });
    expect(reply.actions).toEqual([{ kind: "PAUSE_GOAL", goalId: "g1" }]);
  });

  it("ne fabrique jamais d'action quand rien de structurant n'est demandé", async () => {
    const reply = await runAssistantTurn({
      history: [],
      message: "Pourquoi tu me proposes ça ?",
      context: { activeGoals: [GOAL], nextQuest: NEXT_QUEST, recentMemories: [], userContext: EMPTY_USER_CONTEXT },
    });
    expect(reply.actions).toEqual([]);
    expect(reply.message).toContain(NEXT_QUEST.title);
  });

  it("reste utile sans prochaine quête ni objectif", async () => {
    const reply = await runAssistantTurn({
      history: [],
      message: "Salut",
      context: { activeGoals: [], nextQuest: null, recentMemories: [], userContext: EMPTY_USER_CONTEXT },
    });
    expect(reply.actions).toEqual([]);
    expect(reply.message.length).toBeGreaterThan(0);
  });
});
