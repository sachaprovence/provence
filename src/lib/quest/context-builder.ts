import "server-only";
import type { QuestFeedbackAction, QuestType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { ensureUserBootstrap } from "./bootstrap";

/**
 * Constructeur de contexte centralisé — la "mémoire de travail" du système :
 * reconstruite à chaque appel à partir des sources persistées (Dynamic User
 * Model, mémoire sémantique globale/par-objectif, épisodes récents), jamais
 * un module séparé à synchroniser. Remplace la collecte de contexte ad hoc
 * qui existait indépendamment dans `quest-service.ts` (génération de quêtes)
 * et `assistant-service.ts` (`buildAssistantContext`) — les deux consomment
 * désormais `buildUserContext`, ce qui les rend réellement "même cerveau".
 */

export type Episode = {
  id: string;
  date: Date;
  goalId: string;
  questId: string;
  questTitle: string;
  questType: QuestType;
  action: QuestFeedbackAction;
  note: string | null;
};

export type MemorySnapshot = {
  id: string;
  type: string;
  content: string;
  confidence: number;
};

/**
 * Une "stratégie" observée (Strategy Memory) — calculée à la volée à partir
 * des épisodes/mémoires déjà persistés, PAS stockée dans une nouvelle table
 * pour cette version (toujours fraîche, aucune migration, aucun risque de
 * péremption). `evidenceIds` référence les enregistrements réels
 * (`QuestFeedback`/`QuestMemory`) qui la fondent — jamais une affirmation
 * sans données observées derrière. Interface stable : persistable plus tard
 * sans changer la forme consommée par les appelants.
 */
export type StrategyInsight = {
  type: string;
  content: string;
  confidence: number;
  goalId?: string;
  evidenceIds: string[];
};

export type UserContext = {
  profile: {
    challengeScore: number;
    regularityScore: number;
    enduranceScore: number;
    shortTaskPreference: number;
    autonomyScore: number;
    difficultyTolerance: number;
    effectiveHours: string[];
    actionStyle: string;
  };
  stat: {
    xpTotal: number;
    level: number;
    streakCurrent: number;
    momentum: number;
    disciplineScore: number;
    constanceScore: number;
  };
  activeGoals: { id: string; title: string; priority: string; progressPercent: number }[];
  globalMemories: MemorySnapshot[];
  goalMemories: MemorySnapshot[];
  recentEpisodes: Episode[];
  strategyInsights: StrategyInsight[];
};

const EPISODE_FETCH_LIMIT = 20;
const EPISODE_EXPOSE_LIMIT = 10;
const WINDOW_DAYS = 30;

const MOMENTUM_THRESHOLD = 3;
const DECOMPOSITION_THRESHOLD = 2;
const MEMORY_PASSTHROUGH_MIN_CONFIDENCE = 0.5;

/**
 * Dérive des insights de stratégie à partir d'un lot d'épisodes/mémoires
 * DÉJÀ scopés par l'appelant (global ou un objectif précis, jamais mélangé
 * en interne) — fonction pure, testable sans base de données. Les poids
 * reprennent l'esprit de `difficulty-engine.ts#adjustChallengeScore` (trop
 * facile = signal positif, trop dur/bloqué = signal négatif fort) sans en
 * dépendre directement, pour rester découplée.
 */
export function deriveStrategyInsights(input: { goalId?: string; episodes: Episode[]; memories: MemorySnapshot[] }): StrategyInsight[] {
  const { goalId, episodes, memories } = input;
  const insights: StrategyInsight[] = [];

  const byAction = (action: QuestFeedbackAction) => episodes.filter((e) => e.action === action);
  const tooEasy = byAction("TOO_EASY");
  const tooHard = byAction("TOO_HARD");
  const blocked = byAction("BLOCKED");
  const postponed = byAction("POSTPONED");
  const completed = byAction("COMPLETED");

  const netMomentum = tooEasy.length + completed.length * 0.3 - tooHard.length * 1.5 - blocked.length * 2 - postponed.length * 0.5;

  if (netMomentum >= MOMENTUM_THRESHOLD && tooHard.length === 0 && blocked.length === 0) {
    insights.push({
      type: "DIFFICULTY_MOMENTUM_UP",
      content: "Progresse bien récemment : les paliers actuels sont tenus sans difficulté, un défi plus ambitieux est raisonnable.",
      confidence: Math.min(0.9, 0.4 + netMomentum * 0.05),
      goalId,
      evidenceIds: [...tooEasy, ...completed].map((e) => e.id),
    });
  } else if (netMomentum <= -MOMENTUM_THRESHOLD) {
    insights.push({
      type: "DIFFICULTY_MOMENTUM_DOWN",
      content: "Rencontre des difficultés récentes : réduire la taille/l'ambition des prochaines actions est raisonnable.",
      confidence: Math.min(0.9, 0.4 + Math.abs(netMomentum) * 0.05),
      goalId,
      evidenceIds: [...tooHard, ...blocked, ...postponed].map((e) => e.id),
    });
  }

  if (tooHard.length + blocked.length >= DECOMPOSITION_THRESHOLD) {
    insights.push({
      type: "DECOMPOSITION_NEED",
      content: "A besoin d'étapes plus petites que la moyenne pour progresser sans se bloquer.",
      confidence: Math.min(0.85, 0.35 + (tooHard.length + blocked.length) * 0.1),
      goalId,
      evidenceIds: [...tooHard, ...blocked].map((e) => e.id),
    });
  }

  for (const memory of memories) {
    if (memory.confidence < MEMORY_PASSTHROUGH_MIN_CONFIDENCE) continue;
    insights.push({
      type: `MEMORY_${memory.type}`,
      content: memory.content,
      confidence: memory.confidence,
      goalId,
      evidenceIds: [memory.id],
    });
  }

  return insights;
}

/**
 * Formate le contexte pour injection directe dans un prompt réel (Claude) —
 * un seul format partagé par `goal-analyzer.ts`, `goal-planner.ts`,
 * `quest-generator.ts` et `assistant.ts`, pour que ces quatre points d'entrée
 * lisent réellement "le même cerveau", pas quatre formats différents.
 */
export function formatUserContextForPrompt(context: UserContext): string {
  const parts: string[] = [];

  parts.push(
    `Profil comportemental connu (dérivé de l'historique réel, 0=faible/1=élevé) : régularité ${context.profile.regularityScore.toFixed(2)}, endurance ${context.profile.enduranceScore.toFixed(2)}, préférence tâches courtes ${context.profile.shortTaskPreference.toFixed(2)}, autonomie ${context.profile.autonomyScore.toFixed(2)}, tolérance difficulté ${context.profile.difficultyTolerance.toFixed(2)}, style : ${context.profile.actionStyle}${context.profile.effectiveHours.length > 0 ? `, créneaux efficaces : ${context.profile.effectiveHours.join(", ")}` : ""}.`
  );

  if (context.strategyInsights.length > 0) {
    parts.push(
      `Stratégies observées récemment (fondées sur des données réelles, jamais inventées) :\n${context.strategyInsights
        .map((i) => `- ${i.content} (confiance ${i.confidence.toFixed(2)})`)
        .join("\n")}`
    );
  }

  if (context.goalMemories.length > 0) {
    parts.push(`Mémoires spécifiques à cet objectif :\n${context.goalMemories.map((m) => `- ${m.content} (confiance ${m.confidence.toFixed(2)})`).join("\n")}`);
  }

  if (context.globalMemories.length > 0) {
    parts.push(`Mémoires générales sur l'utilisateur :\n${context.globalMemories.map((m) => `- ${m.content} (confiance ${m.confidence.toFixed(2)})`).join("\n")}`);
  }

  if (context.recentEpisodes.length > 0) {
    const labels: Record<string, string> = {
      COMPLETED: "terminée",
      POSTPONED: "reportée",
      TOO_HARD: "trop difficile",
      TOO_EASY: "trop facile",
      BLOCKED: "bloquée",
      REPLACED: "remplacée",
    };
    parts.push(
      `Épisodes récents, du plus récent au plus ancien (jamais résumés — les faits bruts) :\n${context.recentEpisodes
        .map((e) => `- [${labels[e.action] ?? e.action}] "${e.questTitle}" (${e.questType})${e.note ? ` — note : ${e.note}` : ""}`)
        .join("\n")}`
    );
  }

  return parts.join("\n\n");
}

export async function buildUserContext(userId: string, opts: { goalId?: string } = {}): Promise<UserContext> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const [{ profile, stat }, activeGoals, globalMemoryRows, goalMemoryRows, episodeRows] = await Promise.all([
    ensureUserBootstrap(userId),
    prisma.questGoal.findMany({
      where: { userId, status: "ACTIVE" },
      select: { id: true, title: true, priority: true, progressPercent: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    prisma.questMemory.findMany({ where: { userId, goalId: null, active: true }, orderBy: { confidence: "desc" }, take: 5 }),
    opts.goalId
      ? prisma.questMemory.findMany({ where: { userId, goalId: opts.goalId, active: true }, orderBy: { confidence: "desc" }, take: 5 })
      : Promise.resolve([]),
    prisma.questFeedback.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: EPISODE_FETCH_LIMIT,
      include: { quest: { select: { id: true, title: true, type: true, goalId: true } } },
    }),
  ]);

  const allEpisodes: Episode[] = episodeRows.map((f) => ({
    id: f.id,
    date: f.createdAt,
    goalId: f.quest.goalId,
    questId: f.quest.id,
    questTitle: f.quest.title,
    questType: f.quest.type,
    action: f.action,
    note: f.note,
  }));

  const globalMemories: MemorySnapshot[] = globalMemoryRows.map((m) => ({ id: m.id, type: m.type, content: m.content, confidence: m.confidence }));
  const goalMemories: MemorySnapshot[] = goalMemoryRows.map((m) => ({ id: m.id, type: m.type, content: m.content, confidence: m.confidence }));

  const strategyInsights = [...deriveStrategyInsights({ episodes: allEpisodes, memories: globalMemories })];
  if (opts.goalId) {
    const goalEpisodes = allEpisodes.filter((e) => e.goalId === opts.goalId);
    strategyInsights.push(...deriveStrategyInsights({ goalId: opts.goalId, episodes: goalEpisodes, memories: goalMemories }));
  }

  return {
    profile: {
      challengeScore: profile.challengeScore,
      regularityScore: profile.regularityScore,
      enduranceScore: profile.enduranceScore,
      shortTaskPreference: profile.shortTaskPreference,
      autonomyScore: profile.autonomyScore,
      difficultyTolerance: profile.difficultyTolerance,
      effectiveHours: profile.effectiveHours,
      actionStyle: profile.actionStyle ?? "inconnu",
    },
    stat: {
      xpTotal: stat.xpTotal,
      level: stat.level,
      streakCurrent: stat.streakCurrent,
      momentum: stat.momentum,
      disciplineScore: stat.disciplineScore,
      constanceScore: stat.constanceScore,
    },
    activeGoals,
    globalMemories,
    goalMemories,
    recentEpisodes: allEpisodes.slice(0, EPISODE_EXPOSE_LIMIT),
    strategyInsights,
  };
}
