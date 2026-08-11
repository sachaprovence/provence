import "server-only";
import { prisma } from "@/lib/prisma";
import { bucketTimeOfDayMajority } from "./momentum";
import { computeUserProfile } from "./profile";

const WINDOW_DAYS = 30;

/**
 * Alimente réellement le modèle utilisateur dynamique (§"Dynamic User
 * Model") — avant cette fonction, `QuestUserProfile` n'avait que
 * `challengeScore` de vivant, les 7 autres dimensions restaient figées à
 * leur valeur par défaut depuis la création. Appelée par
 * `quest-service.ts#learnFromOutcome` après chaque événement de feedback.
 */
export async function recomputeUserProfile(userId: string, now: Date = new Date()) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [profile, stat, deepBossFeedback, completedFeedback, durationMemory, userMessageCount] = await Promise.all([
    prisma.questUserProfile.findUnique({ where: { userId } }),
    prisma.questUserStat.findUnique({ where: { userId } }),
    prisma.questFeedback.findMany({
      where: { userId, createdAt: { gte: since }, quest: { type: { in: ["DEEP", "BOSS"] } } },
      select: { action: true },
    }),
    prisma.questFeedback.findMany({ where: { userId, action: "COMPLETED", createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.questMemory.findFirst({ where: { userId, goalId: null, type: "DURATION_PREFERENCE", active: true } }),
    prisma.questConversationMessage.count({
      where: { role: "USER", createdAt: { gte: since }, conversation: { userId } },
    }),
  ]);

  if (!profile || !stat) return null;

  const deepBossCompleted = deepBossFeedback.filter((f) => f.action === "COMPLETED").length;
  const deepBossFailed = deepBossFeedback.filter((f) => f.action === "POSTPONED" || f.action === "BLOCKED" || f.action === "REPLACED").length;

  const output = computeUserProfile({
    constanceScore: stat.constanceScore,
    challengeScore: profile.challengeScore,
    deepBossCompleted,
    deepBossFailed,
    durationPreferenceConfidence: durationMemory?.confidence ?? null,
    timeOfDayMajority: bucketTimeOfDayMajority(completedFeedback.map((f) => f.createdAt)),
    assistantMessageCount: userMessageCount,
    completedCount: completedFeedback.length,
  });

  return prisma.questUserProfile.update({
    where: { userId },
    data: {
      regularityScore: output.regularityScore,
      enduranceScore: output.enduranceScore,
      shortTaskPreference: output.shortTaskPreference,
      effectiveHours: output.effectiveHours,
      autonomyScore: output.autonomyScore,
      difficultyTolerance: output.difficultyTolerance,
      actionStyle: output.actionStyle,
    },
  });
}
