import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

export async function requireOwnedGoal(userId: string, goalId: string) {
  const goal = await prisma.questGoal.findFirst({ where: { id: goalId, userId } });
  if (!goal) throw new NotFoundError("Objectif introuvable.");
  return goal;
}

export async function requireOwnedQuest(userId: string, questId: string) {
  const quest = await prisma.quest.findFirst({ where: { id: questId, userId } });
  if (!quest) throw new NotFoundError("Quête introuvable.");
  return quest;
}
