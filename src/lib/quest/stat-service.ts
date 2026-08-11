import "server-only";
import { prisma } from "@/lib/prisma";
import { computeLevelProgress } from "./xp";
import { computeStreaks, computeDisciplineScore, computeConstanceScore, computeMomentum, toDayKey, type ActivityWindow } from "./momentum";

export async function awardXp(userId: string, params: { questId?: string; amount: number; reason: string }) {
  await prisma.questXPTransaction.create({
    data: { userId, questId: params.questId, amount: params.amount, reason: params.reason },
  });
}

async function computeActivityWindow(userId: string, since: Date, windowDays: number): Promise<ActivityWindow> {
  const [completedCount, postponedCount, blockedCount, replacedCount, activeDayRows] = await Promise.all([
    prisma.questFeedback.count({ where: { userId, action: "COMPLETED", createdAt: { gte: since } } }),
    prisma.questFeedback.count({ where: { userId, action: "POSTPONED", createdAt: { gte: since } } }),
    prisma.questFeedback.count({ where: { userId, action: "BLOCKED", createdAt: { gte: since } } }),
    // Il n'existe pas d'action de feedback "ABANDONED" dédiée (seul `QuestStatus.ABANDONED` existe côté quête) —
    // une quête REPLACED reflète le même esprit ("n'a pas été menée à bien telle quelle") pour le calcul de discipline.
    prisma.questFeedback.count({ where: { userId, action: "REPLACED", createdAt: { gte: since } } }),
    prisma.questFeedback.findMany({ where: { userId, action: "COMPLETED", createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);

  const activeDaysCount = new Set(activeDayRows.map((r) => toDayKey(r.createdAt))).size;
  return { completedCount, postponedCount, blockedCount, abandonedCount: replacedCount, activeDaysCount, windowDays };
}

/**
 * Recalcule intégralement les jauges d'un utilisateur (§23-27 du brief) à
 * partir de l'historique — jamais un delta incrémental appliqué à la volée
 * (source unique de vérité : `QuestFeedback`/`QuestXPTransaction`), pour
 * rester correct même après une modification manuelle des données.
 */
export async function recomputeUserStats(userId: string, now: Date = new Date()) {
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);

  const [window7, window7ForActiveDays, activeDayRows30, allActiveDayRows, xpAgg, lastCompleted] = await Promise.all([
    computeActivityWindow(userId, since7, 7),
    prisma.questFeedback.findMany({ where: { userId, action: "COMPLETED", createdAt: { gte: since7 } }, select: { createdAt: true } }),
    prisma.questFeedback.findMany({ where: { userId, action: "COMPLETED", createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.questFeedback.findMany({ where: { userId, action: "COMPLETED" }, select: { createdAt: true } }),
    prisma.questXPTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.questFeedback.findFirst({ where: { userId, action: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
  ]);

  const activeDays7 = new Set(window7ForActiveDays.map((r) => toDayKey(r.createdAt))).size;
  const activeDays30 = new Set(activeDayRows30.map((r) => toDayKey(r.createdAt))).size;
  const allActiveDayKeys = allActiveDayRows.map((r) => toDayKey(r.createdAt));

  const streaks = computeStreaks(allActiveDayKeys, toDayKey(now));
  const daysSinceLastActive = lastCompleted ? Math.max(0, Math.floor((now.getTime() - lastCompleted.createdAt.getTime()) / 86_400_000)) : 999;

  const disciplineScore = computeDisciplineScore(window7);
  const constanceScore = computeConstanceScore({ activeDays30, streakCurrent: streaks.current, daysSinceLastActive });
  const momentum = computeMomentum({
    completedLast7: window7.completedCount,
    activeDays7,
    postponedLast7: window7.postponedCount,
    streakCurrent: streaks.current,
    daysSinceLastActive,
  });

  const xpTotal = xpAgg._sum.amount ?? 0;
  const { level } = computeLevelProgress(xpTotal);

  const data = {
    xpTotal,
    level,
    streakCurrent: streaks.current,
    streakBest: streaks.best,
    activeDays7,
    activeDays30,
    momentum,
    disciplineScore,
    constanceScore,
    lastActiveAt: lastCompleted?.createdAt ?? null,
  };

  return prisma.questUserStat.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}
