import "server-only";
import { prisma } from "@/lib/prisma";
import type { QuestContext as QuestContextEnum } from "@/generated/prisma/enums";
import { ConflictError } from "@/lib/errors";
import { ensureUserBootstrap } from "./bootstrap";
import { requireOwnedQuest } from "./helpers";
import { writeQuestAuditLog } from "./audit";
import { computeXpReward } from "./xp";
import { computeGoalProgress } from "./progress";
import { adjustChallengeScore, challengeScoreToDifficultyBand, type DifficultySignal } from "./difficulty-engine";
import { getTopCandidates, type Energy, type ScorableQuest, type SelectionContext } from "./scoring";
import { generateQuests } from "./ai/quest-generator";
import { arbitrateNextAction } from "./ai/next-action-explainer";
import { deriveMemoryObservations, deriveGoalScopedMemoryObservations, type FeedbackSample } from "./ai/memory-engine";
import { analyzeBlocker } from "./ai/blocker-analyzer";
import { applyMemoryObservations } from "./memory-service";
import { awardXp, recomputeUserStats } from "./stat-service";
import { recomputeUserProfile } from "./profile-service";
import { buildUserContext } from "./context-builder";

type GoalRef = { id: string; title: string; description: string | null; currentState: string | null; challengeScore: number | null };
type MilestoneRef = { id: string; title: string; description: string | null; order: number } | null;

/**
 * Défi effectif d'UN objectif précis (P0 "Adaptive Difficulty V2") — le
 * score propre à `goal` s'il a déjà été calibré (au moins un événement de
 * feedback sur CET objectif), sinon le score général de l'utilisateur
 * (`QuestUserProfile.challengeScore`) comme point de départ raisonnable pour
 * un objectif tout neuf. Jamais l'inverse : une fois qu'un objectif a son
 * propre score, il ne dérive plus au gré des autres objectifs de l'utilisateur.
 */
function resolveGoalChallengeScore(goal: { challengeScore: number | null }, globalChallengeScore: number): number {
  return goal.challengeScore ?? globalChallengeScore;
}

/**
 * Génère et persiste 1 à N quêtes pour un jalon donné (§2/§7 du brief :
 * seulement les prochaines quêtes pertinentes, jamais tout le parcours).
 * Réutilisée à la fois à la planification initiale et par
 * `ensureUpcomingQuests` (régénération au fil de l'eau).
 */
export async function generateQuestsForMilestone(userId: string, goal: GoalRef, milestone: MilestoneRef, opts: { count?: number } = {}) {
  const [{ profile }, context] = await Promise.all([ensureUserBootstrap(userId), buildUserContext(userId, { goalId: goal.id })]);
  const goalChallengeScore = resolveGoalChallengeScore(goal, profile.challengeScore);
  const band = challengeScoreToDifficultyBand(goalChallengeScore);

  const generation = await generateQuests({
    goalTitle: goal.title,
    goalDescription: goal.description,
    goalCurrentState: goal.currentState,
    milestone: milestone ? { title: milestone.title, description: milestone.description, order: milestone.order } : null,
    difficultyBand: band,
    context,
    count: opts.count ?? 3,
    mode: "NEXT",
  });

  const created = await prisma.$transaction(
    generation.quests.map((draft) =>
      prisma.quest.create({
        data: {
          userId,
          goalId: goal.id,
          milestoneId: milestone?.id,
          title: draft.title,
          description: draft.description ?? undefined,
          why: draft.why ?? undefined,
          type: draft.type,
          estimatedMinutes: draft.estimatedMinutes,
          difficulty: draft.difficulty,
          challengeScore: goalChallengeScore,
          impactWeight: draft.impactWeight,
          xpReward: computeXpReward({ type: draft.type, difficulty: draft.difficulty, impactWeight: draft.impactWeight }),
          aiGenerated: true,
          generationReason: milestone ? `Prochaine étape du jalon « ${milestone.title} ».` : "Prochaine étape de l'objectif.",
        },
      })
    )
  );

  await writeQuestAuditLog({
    userId,
    action: "quest.generated",
    entityType: "QuestGoal",
    entityId: goal.id,
    metadata: { count: created.length, milestoneId: milestone?.id ?? null },
  });

  return created;
}

/** S'assure qu'un objectif actif a toujours au moins une quête à proposer, sans jamais générer tout le parcours d'un coup. */
export async function ensureUpcomingQuests(userId: string, goalId: string) {
  const pendingCount = await prisma.quest.count({ where: { userId, goalId, status: { in: ["PENDING", "ACTIVE"] } } });
  if (pendingCount > 0) return;

  const goal = await prisma.questGoal.findFirst({ where: { id: goalId, userId } });
  if (!goal || goal.status !== "ACTIVE") return;

  const milestoneCount = await prisma.questMilestone.count({ where: { goalId } });
  // Un objectif sans AUCUN jalon n'a jamais été planifié (créé, en attente des réponses de clarification —
  // voir goal-service.ts#createGoal, statut NEEDS_ANSWERS) : ne jamais générer de quêtes tant que le plan
  // (jalons) n'existe pas, même si l'objectif est ACTIVE. Sans ce garde-fou, visiter "Aujourd'hui" avant
  // d'avoir répondu aux questions de clarification générerait des quêtes orphelines (sans jalon).
  if (milestoneCount === 0) return;

  const nextMilestone = await prisma.questMilestone.findFirst({ where: { goalId, status: { not: "DONE" } }, orderBy: { order: "asc" } });
  if (!nextMilestone) return; // tous les jalons terminés : rien à régénérer automatiquement

  await generateQuestsForMilestone(userId, goal, nextMilestone);
}

async function recomputeGoalProgress(goalId: string) {
  const [milestones, quests] = await Promise.all([
    prisma.questMilestone.findMany({ where: { goalId } }),
    prisma.quest.findMany({ where: { goalId } }),
  ]);

  const progressPercent = computeGoalProgress(
    milestones.map((m) => ({ id: m.id, weight: m.weight, done: m.status === "DONE" })),
    quests.map((q) => ({ milestoneId: q.milestoneId, impactWeight: q.impactWeight, completed: q.status === "DONE" }))
  );
  await prisma.questGoal.update({ where: { id: goalId }, data: { progressPercent } });

  for (const milestone of milestones) {
    if (milestone.status === "DONE") continue;
    const milestoneQuests = quests.filter((q) => q.milestoneId === milestone.id);
    if (milestoneQuests.length > 0 && milestoneQuests.every((q) => q.status === "DONE")) {
      await prisma.questMilestone.update({ where: { id: milestone.id }, data: { status: "DONE", completedAt: new Date() } });
    }
  }

  return progressPercent;
}

type RecentFeedbackRow = { action: string; quest: { actualMinutes: number | null; estimatedMinutes: number } };

function computeDifficultySignal(recent: RecentFeedbackRow[]): DifficultySignal {
  return {
    completedSmoothlyCount: recent.filter(
      (f) => f.action === "COMPLETED" && (f.quest.actualMinutes == null || f.quest.actualMinutes <= f.quest.estimatedMinutes * 1.2)
    ).length,
    tooEasyCount: recent.filter((f) => f.action === "TOO_EASY").length,
    tooHardCount: recent.filter((f) => f.action === "TOO_HARD").length,
    abandonedOrBlockedCount: recent.filter((f) => f.action === "BLOCKED").length,
    postponedCount: recent.filter((f) => f.action === "POSTPONED").length,
  };
}

/**
 * Score général (§16 du brief) — reste volontairement global, sur TOUS les
 * objectifs récents de l'utilisateur. Ne calibre plus directement aucune
 * génération de quêtes dès qu'un objectif a son propre score (voir
 * `adjustGoalChallengeScore`) : il ne sert plus que de point de départ
 * raisonnable pour un objectif tout neuf et de signal pour la tolérance au
 * défi du Modèle Utilisateur Dynamique (`profile.ts#computeUserProfile`).
 */
async function adjustGlobalChallengeScore(userId: string) {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const recent = await prisma.questFeedback.findMany({ where: { userId, createdAt: { gte: since } }, include: { quest: true } });
  const signal = computeDifficultySignal(recent);

  const profile = await prisma.questUserProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const nextScore = adjustChallengeScore(profile.challengeScore, signal);
  if (nextScore !== profile.challengeScore) {
    await prisma.questUserProfile.update({ where: { userId }, data: { challengeScore: nextScore } });
  }
}

/**
 * P0 "Adaptive Difficulty V2" — calibration RÉELLEMENT utilisée pour générer
 * les prochaines quêtes de CET objectif précis (voir `resolveGoalChallengeScore`,
 * consommé par `generateQuestsForMilestone`/`regenerateQuestFromSource`).
 * Ne considère que le feedback des quêtes de `goalId` : un échec sur un autre
 * objectif de l'utilisateur n'y change jamais rien, et réciproquement.
 */
async function adjustGoalChallengeScore(userId: string, goalId: string) {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const recent = await prisma.questFeedback.findMany({
    where: { userId, createdAt: { gte: since }, quest: { goalId } },
    include: { quest: true },
  });
  const signal = computeDifficultySignal(recent);

  const [goal, profile] = await Promise.all([
    prisma.questGoal.findUnique({ where: { id: goalId }, select: { challengeScore: true } }),
    prisma.questUserProfile.findUnique({ where: { userId } }),
  ]);
  if (!goal || !profile) return;
  const currentScore = resolveGoalChallengeScore(goal, profile.challengeScore);
  const nextScore = adjustChallengeScore(currentScore, signal);
  if (nextScore !== currentScore) {
    await prisma.questGoal.update({ where: { id: goalId }, data: { challengeScore: nextScore } });
  }
}

async function recordMemoryObservationsFromRecentFeedback(userId: string, goalId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const feedback = await prisma.questFeedback.findMany({
    where: { userId, createdAt: { gte: since } },
    include: { quest: { select: { type: true, goalId: true } } },
  });
  const samples: FeedbackSample[] = feedback.map((f) => ({ action: f.action, questType: f.quest.type, createdAt: f.createdAt, goalId: f.quest.goalId }));

  const globalCandidates = deriveMemoryObservations(samples);
  await applyMemoryObservations(userId, globalCandidates, null);

  const goalCandidates = deriveGoalScopedMemoryObservations(samples, goalId);
  await applyMemoryObservations(userId, goalCandidates, goalId);
}

/**
 * Point d'entrée unique de l'apprentissage (§17 du brief, "Learning From
 * Outcomes") — appelé après CHAQUE événement de feedback (terminée,
 * reportée, trop dur/facile, bloquée), jamais seulement certains d'entre
 * eux (avant ce regroupement, `markBlocked` par exemple n'ajustait pas la
 * difficulté malgré un signal négatif clair — incohérence corrigée ici).
 * Consolide l'ajustement de difficulté (P0 "Adaptive Difficulty V2" : à la
 * fois le score général de l'utilisateur ET le score scopé à CET objectif
 * précis — les deux évoluent indépendamment), la mémoire sémantique
 * (globale ET scopée à l'objectif, §"Goal Memory") et le modèle utilisateur
 * dynamique (§"Dynamic User Model") en un seul point nommé et testable.
 */
async function learnFromOutcome(userId: string, goalId: string) {
  await adjustGlobalChallengeScore(userId);
  await adjustGoalChallengeScore(userId, goalId);
  await recordMemoryObservationsFromRecentFeedback(userId, goalId);
  await recomputeUserProfile(userId);
}

function energyFromCheckInScale(scale: number | null | undefined): Energy | null {
  if (scale == null) return null;
  if (scale <= 2) return "LOW";
  if (scale === 3) return "NORMAL";
  return "HIGH";
}

async function listCandidateQuestsForSelection(userId: string) {
  const quests = await prisma.quest.findMany({
    where: { userId, status: { in: ["PENDING", "ACTIVE"] }, goal: { status: "ACTIVE" } },
    include: { goal: true, dependsOn: { include: { dependsOn: true } } },
  });
  if (quests.length === 0) return { scorable: [] as ScorableQuest[], byId: new Map<string, (typeof quests)[number]>() };

  const questIds = quests.map((q) => q.id);
  const feedbackCounts = await prisma.questFeedback.groupBy({
    by: ["questId", "action"],
    where: { questId: { in: questIds } },
    _count: { _all: true },
  });
  const postponeByQuest = new Map<string, number>();
  const failureByQuest = new Map<string, number>();
  for (const row of feedbackCounts) {
    if (row.action === "POSTPONED") postponeByQuest.set(row.questId, row._count._all);
    if (row.action === "TOO_HARD" || row.action === "BLOCKED") {
      failureByQuest.set(row.questId, (failureByQuest.get(row.questId) ?? 0) + row._count._all);
    }
  }

  const byId = new Map(quests.map((q) => [q.id, q]));

  const scorable: ScorableQuest[] = quests.map((q) => ({
    id: q.id,
    goalPriority: q.goal.priority,
    type: q.type,
    priority: q.priority,
    difficulty: q.difficulty,
    impactWeight: q.impactWeight,
    estimatedMinutes: q.estimatedMinutes,
    deadline: q.deadline,
    context: q.context,
    createdAt: q.createdAt,
    goalProgressPercent: q.goal.progressPercent,
    dependenciesMet: q.dependsOn.every((dep) => dep.dependsOn.status === "DONE"),
    postponeCount: postponeByQuest.get(q.id) ?? 0,
    recentFailureCount: failureByQuest.get(q.id) ?? 0,
  }));

  return { scorable, byId };
}

export type NextActionInput = {
  availableMinutes?: number | null;
  energy?: Energy | null;
  context?: QuestContextEnum | null;
};

const NEXT_ACTION_TOP_CANDIDATES = 3;

/**
 * `getNextBestAction` (§11 du brief) — point d'entrée métier central.
 * S'assure d'abord que chaque objectif actif a des quêtes disponibles, puis
 * sélectionne déterministiquement la meilleure (`src/lib/quest/scoring.ts`).
 * L'arbitrage IA (`next-action-explainer.ts`, ajustement §4) ne fait
 * qu'expliquer ce choix, ou — dans des conditions strictement bornées —
 * départager les 2-3 meilleurs candidats déjà déterminés ici : il ne peut
 * jamais recevoir ni sélectionner une quête en dehors de cet ensemble.
 */
export async function getNextBestActionForUser(userId: string, input: NextActionInput) {
  await ensureUserBootstrap(userId);
  const activeGoals = await prisma.questGoal.findMany({ where: { userId, status: "ACTIVE" } });
  await Promise.all(activeGoals.map((g) => ensureUpcomingQuests(userId, g.id)));

  const { scorable, byId } = await listCandidateQuestsForSelection(userId);
  if (scorable.length === 0) return null;

  const activeQuestCount = await prisma.quest.count({ where: { userId, status: "ACTIVE" } });

  const hasExplicitContext = input.availableMinutes != null || input.energy != null;
  const latestCheckIn = hasExplicitContext ? null : await prisma.questCheckIn.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });

  const selectionContext: SelectionContext = {
    availableMinutes: input.availableMinutes ?? latestCheckIn?.availableMinutes ?? null,
    energy: input.energy ?? energyFromCheckInScale(latestCheckIn?.energy),
    context: input.context ?? null,
    activeQuestCount,
    now: new Date(),
  };

  const top = getTopCandidates(scorable, selectionContext, NEXT_ACTION_TOP_CANDIDATES);
  if (top.length === 0) return null;

  const userContext = await buildUserContext(userId);
  const arbitration = await arbitrateNextAction({ top, context: userContext });
  // Filet de sécurité final : même si `arbitrateNextAction` valide déjà
  // l'appartenance à `top`, ne jamais faire confiance à un id venu d'un
  // appel IA sans revérifier ici avant de choisir la quête retournée.
  const result = top.find((c) => c.quest.id === arbitration.selectedQuestId) ?? top[0];

  const questRecord = byId.get(result.quest.id);
  return { ...result, arbitration, questRecord };
}

export async function startQuest(userId: string, questId: string) {
  const quest = await requireOwnedQuest(userId, questId);
  if (quest.status !== "PENDING") throw new ConflictError("Cette quête ne peut pas être démarrée dans son état actuel.");
  const updated = await prisma.quest.update({ where: { id: questId }, data: { status: "ACTIVE", startedAt: new Date() } });
  await writeQuestAuditLog({ userId, action: "quest.started", entityType: "Quest", entityId: questId });
  return updated;
}

export async function completeQuest(userId: string, questId: string, actualMinutes?: number | null) {
  const quest = await requireOwnedQuest(userId, questId);
  if (quest.status === "DONE") throw new ConflictError("Cette quête est déjà terminée.");

  const updated = await prisma.quest.update({
    where: { id: questId },
    data: { status: "DONE", completedAt: new Date(), actualMinutes: actualMinutes ?? undefined },
  });
  await prisma.questFeedback.create({ data: { questId, userId, action: "COMPLETED" } });
  await awardXp(userId, { questId, amount: quest.xpReward, reason: `Quête terminée : ${quest.title}` });

  await recomputeGoalProgress(quest.goalId);
  await learnFromOutcome(userId, quest.goalId);
  await recomputeUserStats(userId);
  await ensureUpcomingQuests(userId, quest.goalId);

  await writeQuestAuditLog({ userId, action: "quest.completed", entityType: "Quest", entityId: questId, metadata: { xp: quest.xpReward } });
  return updated;
}

export async function postponeQuest(userId: string, questId: string, note?: string | null) {
  const quest = await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "POSTPONED", note: note ?? undefined } });
  await learnFromOutcome(userId, quest.goalId);

  const postponeCount = await prisma.questFeedback.count({ where: { questId, action: "POSTPONED" } });
  const decision = analyzeBlocker({ postponeCount, blockedFeedbackCount: 0 });
  await writeQuestAuditLog({ userId, action: "quest.postponed", entityType: "Quest", entityId: questId, metadata: { postponeCount } });

  if (decision.shouldDecompose) return decomposeQuest(userId, questId, decision.reason);
  return { quest, subQuests: [] as typeof quest[], decomposed: false as const };
}

export async function markTooHard(userId: string, questId: string) {
  const quest = await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "TOO_HARD" } });
  await learnFromOutcome(userId, quest.goalId);
  await writeQuestAuditLog({ userId, action: "quest.too_hard", entityType: "Quest", entityId: questId });
  return decomposeQuest(userId, questId, "Signalée trop difficile par l'utilisateur (§17 du brief).");
}

/**
 * Trop facile (§16 du brief) : remplace immédiatement la quête par une
 * version plus difficile dans la continuité (ex. course à pied : 5 min ->
 * 8-10 min), symétrique de `markTooHard`/`decomposeQuest` côté "plus dur".
 */
export async function markTooEasy(userId: string, questId: string) {
  const quest = await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "TOO_EASY" } });
  await learnFromOutcome(userId, quest.goalId);
  await writeQuestAuditLog({ userId, action: "quest.too_easy", entityType: "Quest", entityId: questId });
  return increaseQuestDifficulty(userId, questId, "Signalée trop facile par l'utilisateur (§16 du brief).");
}

export async function markBlocked(userId: string, questId: string, note?: string | null) {
  const quest = await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "BLOCKED", note: note ?? undefined } });
  // §17 du brief : avant ce regroupement, "bloquée" n'ajustait jamais la difficulté malgré un
  // signal négatif clair — incohérence corrigée par `learnFromOutcome`, appelé uniformément
  // pour tout événement de feedback plutôt que pour certains seulement.
  await learnFromOutcome(userId, quest.goalId);
  await writeQuestAuditLog({ userId, action: "quest.blocked", entityType: "Quest", entityId: questId });
  return decomposeQuest(userId, questId, "Signalée bloquée par l'utilisateur.");
}

export async function reduceQuestDifficulty(userId: string, questId: string) {
  const quest = await requireOwnedQuest(userId, questId);
  const difficulty = Math.max(1, quest.difficulty - 1);
  const xpReward = computeXpReward({ type: quest.type, difficulty, impactWeight: quest.impactWeight });
  const updated = await prisma.quest.update({ where: { id: questId }, data: { difficulty, xpReward } });
  await writeQuestAuditLog({ userId, action: "quest.difficulty_reduced", entityType: "Quest", entityId: questId, metadata: { difficulty } });
  return updated;
}

export async function replaceQuest(userId: string, questId: string, reason?: string | null) {
  const quest = await requireOwnedQuest(userId, questId);
  const goal = await prisma.questGoal.findUniqueOrThrow({ where: { id: quest.goalId } });
  const milestone = quest.milestoneId ? await prisma.questMilestone.findUnique({ where: { id: quest.milestoneId } }) : null;

  await prisma.$transaction([
    prisma.quest.update({ where: { id: questId }, data: { status: "REPLACED" } }),
    prisma.questFeedback.create({ data: { questId, userId, action: "REPLACED", note: reason ?? undefined } }),
  ]);

  const [created] = await generateQuestsForMilestone(userId, goal, milestone, { count: 1 });
  await writeQuestAuditLog({ userId, action: "quest.replaced", entityType: "Quest", entityId: questId, metadata: { replacedBy: created?.id ?? null } });
  return created;
}

/**
 * Remplace une quête par une version ajustée (§16-17 du brief) — la quête
 * d'origine passe en `REPLACED` (jamais supprimée — conserve l'historique et
 * `parentQuestId` relie la/les nouvelle(s) quête(s) à leur origine).
 * `EASIER` : décomposition (§17, quête trop dure/bloquée/reportée). `HARDER` :
 * adaptation à la hausse (§16, quête trop facile).
 */
async function regenerateQuestFromSource(userId: string, questId: string, direction: "EASIER" | "HARDER", reason: string | null) {
  const quest = await requireOwnedQuest(userId, questId);
  if (quest.status === "REPLACED") {
    return { quest, subQuests: [] as typeof quest[], decomposed: false as const };
  }

  const [{ profile }, context, goal] = await Promise.all([
    ensureUserBootstrap(userId),
    buildUserContext(userId, { goalId: quest.goalId }),
    prisma.questGoal.findUniqueOrThrow({ where: { id: quest.goalId } }),
  ]);
  const goalChallengeScore = resolveGoalChallengeScore(goal, profile.challengeScore);
  const scoreShift = direction === "EASIER" ? -15 : 15;
  const band = challengeScoreToDifficultyBand(Math.max(1, Math.min(100, goalChallengeScore + scoreShift)));

  const generation = await generateQuests({
    goalTitle: goal.title,
    goalDescription: goal.description,
    goalCurrentState: goal.currentState,
    milestone: null,
    difficultyBand: band,
    context,
    count: direction === "EASIER" ? 3 : 1,
    mode: direction === "EASIER" ? "DECOMPOSE" : "INCREASE",
    sourceQuest: { title: quest.title, description: quest.description },
  });

  const [replacedQuest, ...subQuests] = await prisma.$transaction([
    prisma.quest.update({ where: { id: questId }, data: { status: "REPLACED" } }),
    ...generation.quests.map((draft) =>
      prisma.quest.create({
        data: {
          userId,
          goalId: quest.goalId,
          milestoneId: quest.milestoneId,
          parentQuestId: questId,
          title: draft.title,
          description: draft.description ?? undefined,
          why: draft.why ?? undefined,
          type: draft.type,
          estimatedMinutes: draft.estimatedMinutes,
          difficulty: draft.difficulty,
          challengeScore: goalChallengeScore,
          impactWeight: draft.impactWeight,
          xpReward: computeXpReward({ type: draft.type, difficulty: draft.difficulty, impactWeight: draft.impactWeight }),
          aiGenerated: true,
          generationReason: reason ?? (direction === "EASIER" ? "Décomposition automatique." : "Adaptation à la hausse automatique."),
        },
      })
    ),
  ]);

  await writeQuestAuditLog({
    userId,
    action: direction === "EASIER" ? "quest.decomposed" : "quest.increased",
    entityType: "Quest",
    entityId: questId,
    metadata: { subQuestCount: subQuests.length, reason },
  });

  return { quest: replacedQuest, subQuests, decomposed: true as const };
}

export async function decomposeQuest(userId: string, questId: string, reason: string | null) {
  return regenerateQuestFromSource(userId, questId, "EASIER", reason);
}

export async function increaseQuestDifficulty(userId: string, questId: string, reason: string | null) {
  return regenerateQuestFromSource(userId, questId, "HARDER", reason);
}

export type { GoalRef, MilestoneRef };
