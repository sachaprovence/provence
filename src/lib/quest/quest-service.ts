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
import { getNextBestAction, type Energy, type ScorableQuest, type SelectionContext } from "./scoring";
import { generateQuests } from "./ai/quest-generator";
import { deriveMemoryObservations, type FeedbackSample } from "./ai/memory-engine";
import { analyzeBlocker } from "./ai/blocker-analyzer";
import { applyMemoryObservations, getActiveMemoriesForPrompt } from "./memory-service";
import { awardXp, recomputeUserStats } from "./stat-service";

type GoalRef = { id: string; title: string; description: string | null };
type MilestoneRef = { id: string; title: string; description: string | null } | null;

async function buildRecentFeedbackSummary(userId: string): Promise<string | null> {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const postponedCount = await prisma.questFeedback.count({ where: { userId, action: "POSTPONED", createdAt: { gte: since } } });
  if (postponedCount >= 2) {
    return `A reporté ${postponedCount} quête(s) au cours des deux dernières semaines — privilégier des quêtes plus petites et plus simples.`;
  }
  return null;
}

/**
 * Génère et persiste 1 à N quêtes pour un jalon donné (§2/§7 du brief :
 * seulement les prochaines quêtes pertinentes, jamais tout le parcours).
 * Réutilisée à la fois à la planification initiale et par
 * `ensureUpcomingQuests` (régénération au fil de l'eau).
 */
export async function generateQuestsForMilestone(userId: string, goal: GoalRef, milestone: MilestoneRef, opts: { count?: number } = {}) {
  const { profile } = await ensureUserBootstrap(userId);
  const band = challengeScoreToDifficultyBand(profile.challengeScore);
  const [activeMemories, recentFeedbackSummary] = await Promise.all([getActiveMemoriesForPrompt(userId), buildRecentFeedbackSummary(userId)]);

  const generation = await generateQuests({
    goalTitle: goal.title,
    goalDescription: goal.description,
    milestone: milestone ? { title: milestone.title, description: milestone.description } : null,
    difficultyBand: band,
    activeMemories,
    recentFeedbackSummary,
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
          challengeScore: profile.challengeScore,
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

async function adjustDifficultyFromRecentSignals(userId: string) {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const recent = await prisma.questFeedback.findMany({ where: { userId, createdAt: { gte: since } }, include: { quest: true } });

  const signal: DifficultySignal = {
    completedSmoothlyCount: recent.filter(
      (f) => f.action === "COMPLETED" && (f.quest.actualMinutes == null || f.quest.actualMinutes <= f.quest.estimatedMinutes * 1.2)
    ).length,
    tooEasyCount: recent.filter((f) => f.action === "TOO_EASY").length,
    tooHardCount: recent.filter((f) => f.action === "TOO_HARD").length,
    abandonedOrBlockedCount: recent.filter((f) => f.action === "BLOCKED").length,
    postponedCount: recent.filter((f) => f.action === "POSTPONED").length,
  };

  const profile = await prisma.questUserProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const nextScore = adjustChallengeScore(profile.challengeScore, signal);
  if (nextScore !== profile.challengeScore) {
    await prisma.questUserProfile.update({ where: { userId }, data: { challengeScore: nextScore } });
  }
}

async function recordMemoryObservationsFromRecentFeedback(userId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const feedback = await prisma.questFeedback.findMany({
    where: { userId, createdAt: { gte: since } },
    include: { quest: { select: { type: true } } },
  });
  const samples: FeedbackSample[] = feedback.map((f) => ({ action: f.action, questType: f.quest.type, createdAt: f.createdAt }));
  const candidates = deriveMemoryObservations(samples);
  await applyMemoryObservations(userId, candidates);
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

/**
 * `getNextBestAction` (§11 du brief) — point d'entrée métier central.
 * S'assure d'abord que chaque objectif actif a des quêtes disponibles, puis
 * sélectionne déterministiquement la meilleure (`src/lib/quest/scoring.ts`).
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

  const result = getNextBestAction(scorable, selectionContext);
  if (!result) return null;

  const questRecord = byId.get(result.quest.id);
  return { ...result, questRecord };
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
  await adjustDifficultyFromRecentSignals(userId);
  await recordMemoryObservationsFromRecentFeedback(userId);
  await recomputeUserStats(userId);
  await ensureUpcomingQuests(userId, quest.goalId);

  await writeQuestAuditLog({ userId, action: "quest.completed", entityType: "Quest", entityId: questId, metadata: { xp: quest.xpReward } });
  return updated;
}

export async function postponeQuest(userId: string, questId: string, note?: string | null) {
  await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "POSTPONED", note: note ?? undefined } });
  await adjustDifficultyFromRecentSignals(userId);
  await recordMemoryObservationsFromRecentFeedback(userId);

  const postponeCount = await prisma.questFeedback.count({ where: { questId, action: "POSTPONED" } });
  const decision = analyzeBlocker({ postponeCount, blockedFeedbackCount: 0 });
  await writeQuestAuditLog({ userId, action: "quest.postponed", entityType: "Quest", entityId: questId, metadata: { postponeCount } });

  if (decision.shouldDecompose) return decomposeQuest(userId, questId, decision.reason);
  const quest = await requireOwnedQuest(userId, questId);
  return { quest, subQuests: [] as typeof quest[], decomposed: false as const };
}

export async function markTooHard(userId: string, questId: string) {
  await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "TOO_HARD" } });
  await adjustDifficultyFromRecentSignals(userId);
  await recordMemoryObservationsFromRecentFeedback(userId);
  await writeQuestAuditLog({ userId, action: "quest.too_hard", entityType: "Quest", entityId: questId });
  return decomposeQuest(userId, questId, "Signalée trop difficile par l'utilisateur (§17 du brief).");
}

export async function markTooEasy(userId: string, questId: string) {
  const quest = await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "TOO_EASY" } });
  await adjustDifficultyFromRecentSignals(userId);
  await writeQuestAuditLog({ userId, action: "quest.too_easy", entityType: "Quest", entityId: questId });
  return quest;
}

export async function markBlocked(userId: string, questId: string, note?: string | null) {
  await requireOwnedQuest(userId, questId);
  await prisma.questFeedback.create({ data: { questId, userId, action: "BLOCKED", note: note ?? undefined } });
  await recordMemoryObservationsFromRecentFeedback(userId);
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
 * Décomposition intelligente (§17 du brief) : la quête d'origine passe en
 * `REPLACED` (jamais supprimée — conserve l'historique et `parentQuestId`
 * relie les sous-quêtes créées à leur origine).
 */
export async function decomposeQuest(userId: string, questId: string, reason: string | null) {
  const quest = await requireOwnedQuest(userId, questId);
  if (quest.status === "REPLACED") {
    return { quest, subQuests: [] as typeof quest[], decomposed: false as const };
  }

  const { profile } = await ensureUserBootstrap(userId);
  // Une décomposition vise délibérément plus facile que le niveau courant de l'utilisateur.
  const band = challengeScoreToDifficultyBand(Math.max(1, profile.challengeScore - 15));
  const [activeMemories, recentFeedbackSummary, goal] = await Promise.all([
    getActiveMemoriesForPrompt(userId),
    buildRecentFeedbackSummary(userId),
    prisma.questGoal.findUniqueOrThrow({ where: { id: quest.goalId } }),
  ]);

  const generation = await generateQuests({
    goalTitle: goal.title,
    goalDescription: goal.description,
    milestone: null,
    difficultyBand: band,
    activeMemories,
    recentFeedbackSummary,
    count: 3,
    mode: "DECOMPOSE",
    decomposeSource: { title: quest.title, description: quest.description },
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
          challengeScore: profile.challengeScore,
          impactWeight: draft.impactWeight,
          xpReward: computeXpReward({ type: draft.type, difficulty: draft.difficulty, impactWeight: draft.impactWeight }),
          aiGenerated: true,
          generationReason: reason ?? "Décomposition automatique.",
        },
      })
    ),
  ]);

  await writeQuestAuditLog({
    userId,
    action: "quest.decomposed",
    entityType: "Quest",
    entityId: questId,
    metadata: { subQuestCount: subQuests.length, reason },
  });

  return { quest: replacedQuest, subQuests, decomposed: true as const };
}

export type { GoalRef, MilestoneRef };
