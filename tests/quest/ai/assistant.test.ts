import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { runAssistantTurn } from "@/lib/quest/ai/assistant";

const NEXT_QUEST = { id: "q1", title: "Appeler un prospect", estimatedMinutes: 20, difficulty: 3 };
const GOAL = { id: "g1", title: "Créer mon entreprise", progressPercent: 42 };

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
      context: { activeGoals: [GOAL], nextQuest: NEXT_QUEST, recentMemories: [] },
    });
    expect(reply.actions).toEqual([{ kind: "DECOMPOSE_QUEST", questId: "q1" }]);
  });

  it("détecte une demande de pause et résout le bon objectif par son titre", async () => {
    const reply = await runAssistantTurn({
      history: [],
      message: "Mets en pause mon objectif Créer mon entreprise",
      context: { activeGoals: [GOAL], nextQuest: NEXT_QUEST, recentMemories: [] },
    });
    expect(reply.actions).toEqual([{ kind: "PAUSE_GOAL", goalId: "g1" }]);
  });

  it("ne fabrique jamais d'action quand rien de structurant n'est demandé", async () => {
    const reply = await runAssistantTurn({
      history: [],
      message: "Pourquoi tu me proposes ça ?",
      context: { activeGoals: [GOAL], nextQuest: NEXT_QUEST, recentMemories: [] },
    });
    expect(reply.actions).toEqual([]);
    expect(reply.message).toContain(NEXT_QUEST.title);
  });

  it("reste utile sans prochaine quête ni objectif", async () => {
    const reply = await runAssistantTurn({
      history: [],
      message: "Salut",
      context: { activeGoals: [], nextQuest: null, recentMemories: [] },
    });
    expect(reply.actions).toEqual([]);
    expect(reply.message.length).toBeGreaterThan(0);
  });
});
