import type { QuestContext, QuestGoalPriority, QuestType } from "@/generated/prisma/enums";

/**
 * Moteur de décision déterministe (§11-12 du brief) — `getNextBestAction` ne
 * choisit JAMAIS arbitrairement : chaque quête candidate reçoit un
 * `questScore` calculé à partir de facteurs structurés, jamais d'un appel
 * IA (l'IA génère des quêtes candidates ailleurs, `quest-generator.ts` ;
 * cette fonction ne fait que sélectionner parmi elles).
 *
 * Formule (§12) : un cœur multiplicatif de facteurs de "fit" (0 = mauvais
 * fit, ~1 = neutre, >1 = bon fit), ramené à une échelle ~0-100, dont on
 * soustrait des pénalités additives (répétition, échecs récents,
 * surcharge). Les dépendances non résolues excluent la quête AVANT le
 * scoring (une quête bloquée par une dépendance ne peut, par définition,
 * pas être "la meilleure action maintenant") — `dependencyPenalty` reste
 * dans le détail retourné pour rester traçable, toujours à 0 ici.
 */

export type Energy = "LOW" | "NORMAL" | "HIGH";

export type SelectionContext = {
  /** Minutes disponibles annoncées par l'utilisateur (5/15/30/60/120+). `null` = pas de contrainte connue. */
  availableMinutes: number | null;
  energy: Energy | null;
  context: QuestContext | null;
  /** Nombre de quêtes déjà en statut ACTIVE (démarrées, non terminées) pour cet utilisateur — pénalise la surcharge (§12 `overloadPenalty`). */
  activeQuestCount: number;
  now: Date;
};

export type ScorableQuest = {
  id: string;
  goalPriority: QuestGoalPriority;
  type: QuestType;
  priority: number;
  difficulty: number;
  impactWeight: number;
  estimatedMinutes: number;
  deadline: Date | null;
  context: QuestContext | null;
  createdAt: Date;
  /** Progression courante (0-100) de l'objectif parent — une quête qui rapproche un objectif presque terminé est légèrement favorisée. */
  goalProgressPercent: number;
  dependenciesMet: boolean;
  /** Nombre de fois où cette quête précise a été reportée (`QuestFeedback.action = POSTPONED`). */
  postponeCount: number;
  /** Nombre d'échecs récents (TOO_HARD/BLOCKED) sur cette quête. */
  recentFailureCount: number;
};

export type QuestScoreBreakdown = {
  priorityWeight: number;
  impactWeight: number;
  urgencyWeight: number;
  contextFit: number;
  energyFit: number;
  durationFit: number;
  progressValue: number;
  learningValue: number;
  repetitionPenalty: number;
  failurePenalty: number;
  dependencyPenalty: number;
  overloadPenalty: number;
  score: number;
};

const LEARNING_VALUE_BY_TYPE: Record<QuestType, number> = {
  MICRO: 0.9,
  SHORT: 0.95,
  NORMAL: 1,
  DEEP: 1.15,
  HABIT: 1,
  CHALLENGE: 1.2,
  BOSS: 1.25,
};

function priorityFactor(goalPriority: QuestGoalPriority, questPriority: number): number {
  const goalFactor = goalPriority === "PRIMARY" ? 1.3 : 1;
  const clampedPriority = Math.max(1, Math.min(5, questPriority));
  const questFactor = (6 - clampedPriority) / 5; // priority 1 (haute) -> 1.0, priority 5 (basse) -> 0.2
  return goalFactor * questFactor;
}

function urgencyFactor(deadline: Date | null, now: Date): number {
  if (!deadline) return 1;
  const daysLeft = (deadline.getTime() - now.getTime()) / 86_400_000;
  if (daysLeft <= 0) return 2.5;
  if (daysLeft >= 14) return 1;
  return 1 + ((14 - daysLeft) / 14) * 1.5;
}

function contextFitFactor(questContext: QuestContext | null, userContext: QuestContext | null): number {
  if (!questContext) return 1; // quête compatible avec tout contexte
  if (!userContext) return 0.9; // contexte utilisateur inconnu : légère prudence, pas d'exclusion
  return questContext === userContext ? 1.2 : 0.4;
}

function energyFitFactor(difficulty: number, energy: Energy | null): number {
  if (!energy || energy === "HIGH") return 1;
  if (energy === "NORMAL") return difficulty <= 4 ? 1 : 0.7;
  // LOW
  if (difficulty <= 2) return 1.1;
  if (difficulty === 3) return 0.7;
  return 0.3;
}

function durationFitFactor(estimatedMinutes: number, availableMinutes: number | null): number {
  if (availableMinutes == null) return 1;
  if (estimatedMinutes <= availableMinutes) return 1.15;
  const overBy = estimatedMinutes - availableMinutes;
  return overBy <= 10 ? 0.6 : 0.15;
}

export function scoreQuest(quest: ScorableQuest, context: SelectionContext): QuestScoreBreakdown {
  const priorityWeight = priorityFactor(quest.goalPriority, quest.priority);
  const impactWeight = Math.max(0.1, quest.impactWeight);
  const urgencyWeight = urgencyFactor(quest.deadline, context.now);
  const contextFit = contextFitFactor(quest.context, context.context);
  const energyFit = energyFitFactor(quest.difficulty, context.energy);
  const durationFit = durationFitFactor(quest.estimatedMinutes, context.availableMinutes);
  const progressValue = 1 + quest.goalProgressPercent / 200; // jusqu'à 1.5x quand l'objectif est presque terminé
  const learningValue = LEARNING_VALUE_BY_TYPE[quest.type];

  const base =
    priorityWeight * impactWeight * urgencyWeight * contextFit * energyFit * durationFit * progressValue * learningValue * 100;

  const repetitionPenalty = quest.postponeCount * 8;
  const failurePenalty = quest.recentFailureCount * 6;
  const dependencyPenalty = 0; // les dépendances non résolues excluent la quête avant scoring, voir getNextBestAction
  const overloadPenalty = context.activeQuestCount > 2 ? (context.activeQuestCount - 2) * 5 : 0;

  const score = Math.max(0, base - repetitionPenalty - failurePenalty - dependencyPenalty - overloadPenalty);

  return {
    priorityWeight,
    impactWeight,
    urgencyWeight,
    contextFit,
    energyFit,
    durationFit,
    progressValue,
    learningValue,
    repetitionPenalty,
    failurePenalty,
    dependencyPenalty,
    overloadPenalty,
    score: Math.round(score * 10) / 10,
  };
}

export type NextBestAction = {
  quest: ScorableQuest;
  breakdown: QuestScoreBreakdown;
};

/**
 * Sélectionne la meilleure quête parmi les candidates éligibles. Exclut
 * d'abord celles dont les dépendances ne sont pas résolues (jamais
 * proposées, quel que soit leur score). Égalité de score : deadline la plus
 * proche d'abord, puis quête la plus ancienne (évite qu'une quête ne soit
 * jamais choisie faute de nouveauté).
 */
export function getNextBestAction(candidates: ScorableQuest[], context: SelectionContext): NextBestAction | null {
  const eligible = candidates.filter((q) => q.dependenciesMet);
  if (eligible.length === 0) return null;

  let best: NextBestAction | null = null;
  for (const quest of eligible) {
    const breakdown = scoreQuest(quest, context);
    if (
      !best ||
      breakdown.score > best.breakdown.score ||
      (breakdown.score === best.breakdown.score && isBetterTiebreak(quest, best.quest))
    ) {
      best = { quest, breakdown };
    }
  }
  return best;
}

function isBetterTiebreak(a: ScorableQuest, b: ScorableQuest): boolean {
  if (a.deadline && b.deadline) return a.deadline.getTime() < b.deadline.getTime();
  if (a.deadline && !b.deadline) return true;
  if (!a.deadline && b.deadline) return false;
  return a.createdAt.getTime() < b.createdAt.getTime();
}
