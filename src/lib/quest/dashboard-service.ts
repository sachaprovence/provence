import "server-only";
import { prisma } from "@/lib/prisma";
import { ensureUserBootstrap } from "./bootstrap";
import { getNextBestActionForUser } from "./quest-service";

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Agrégat unique pour l'écran "Aujourd'hui" (§30 du brief) — reste volontairement simple, pas un dashboard surchargé. */
export async function getTodaySnapshot(userId: string) {
  const { profile, stat } = await ensureUserBootstrap(userId);

  const [primaryGoal, secondaryGoals, nextAction, completedTodayCount] = await Promise.all([
    prisma.questGoal.findFirst({ where: { userId, status: "ACTIVE", priority: "PRIMARY" }, orderBy: { createdAt: "asc" } }),
    prisma.questGoal.findMany({ where: { userId, status: "ACTIVE", priority: "SECONDARY" }, orderBy: { createdAt: "asc" } }),
    getNextBestActionForUser(userId, {}),
    prisma.questFeedback.count({ where: { userId, action: "COMPLETED", createdAt: { gte: startOfToday() } } }),
  ]);

  return { profile, stat, primaryGoal, secondaryGoals, nextAction, completedTodayCount };
}
