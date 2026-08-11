import "server-only";
import { prisma } from "@/lib/prisma";

function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // lundi comme premier jour de semaine
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/**
 * Bilan hebdomadaire (§37 du brief) — calculable à la demande (pas de cron
 * dans ce lot, voir ADR 0049), idempotent par semaine (`@@unique([userId, weekStart])`).
 */
export async function computeWeeklyReview(userId: string, referenceDate: Date = new Date()) {
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const [completedFeedback, postponedCount, xpAgg, goals] = await Promise.all([
    prisma.questFeedback.count({ where: { userId, action: "COMPLETED", createdAt: { gte: weekStart, lt: weekEnd } } }),
    prisma.questFeedback.count({ where: { userId, action: "POSTPONED", createdAt: { gte: weekStart, lt: weekEnd } } }),
    prisma.questXPTransaction.aggregate({ where: { userId, createdAt: { gte: weekStart, lt: weekEnd } }, _sum: { amount: true } }),
    prisma.questGoal.findMany({ where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true, title: true, progressPercent: true } }),
  ]);

  const observations: string[] = [];
  const suggestions: string[] = [];
  if (postponedCount >= 3) {
    observations.push(`${postponedCount} quête(s) reportée(s) cette semaine.`);
    suggestions.push("La semaine prochaine, découper les quêtes reportées en sessions plus courtes (10-15 minutes).");
  }
  if (completedFeedback === 0) {
    observations.push("Aucune quête terminée cette semaine.");
    suggestions.push("Reprendre avec une micro-quête de moins de 10 minutes pour relancer la dynamique.");
  }

  const data = {
    questsCompleted: completedFeedback,
    xpGained: xpAgg._sum.amount ?? 0,
    goalsProgress: goals as never,
    observations,
    suggestions,
  };

  return prisma.questWeeklyReview.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    update: data,
    create: { userId, weekStart, ...data },
  });
}

export async function getLatestWeeklyReview(userId: string) {
  return prisma.questWeeklyReview.findFirst({ where: { userId }, orderBy: { weekStart: "desc" } });
}
