import "server-only";
import { prisma } from "@/lib/prisma";
import { ensureUserBootstrap } from "./bootstrap";
import { requireOwnedGoal } from "./helpers";
import { writeQuestAuditLog } from "./audit";
import { generateQuestsForMilestone } from "./quest-service";
import { analyzeGoal } from "./ai/goal-analyzer";
import { planGoal } from "./ai/goal-planner";
import type { ClarifyingAnswer, GoalAnalysis } from "./ai/schemas";
import { buildUserContext } from "./context-builder";

async function finalizeGoalAnalysisAndPlan(userId: string, goalId: string, analysis: GoalAnalysis) {
  const updated = await prisma.questGoal.update({
    where: { id: goalId },
    data: {
      currentState: analysis.currentState ?? undefined,
      targetState: analysis.targetState ?? undefined,
      successMetrics: analysis.successMetrics,
      obstacles: analysis.blockers,
      difficultyEstimate: analysis.difficultyEstimate,
    },
  });

  const context = await buildUserContext(userId, { goalId });
  const plan = await planGoal({ title: updated.title, description: updated.description, analysis, context });
  const milestones = await prisma.$transaction(
    plan.milestones.map((m, index) =>
      prisma.questMilestone.create({
        data: { goalId, title: m.title, description: m.description ?? undefined, weight: m.weight, order: index },
      })
    )
  );

  const quests = await generateQuestsForMilestone(userId, updated, milestones[0] ?? null);

  await writeQuestAuditLog({
    userId,
    action: "goal.planned",
    entityType: "QuestGoal",
    entityId: goalId,
    metadata: { milestoneCount: milestones.length, questCount: quests.length },
  });

  return { goal: updated, milestones, quests };
}

/** Création d'objectif (§3-4 du brief) — analyse immédiate, questions de clarification seulement si elles ont un impact réel sur le plan. */
export async function createGoal(userId: string, input: { title: string; description?: string | null }) {
  await ensureUserBootstrap(userId);
  const activeCount = await prisma.questGoal.count({ where: { userId, status: "ACTIVE" } });

  const goal = await prisma.questGoal.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? undefined,
      priority: activeCount === 0 ? "PRIMARY" : "SECONDARY",
    },
  });
  await writeQuestAuditLog({ userId, action: "goal.created", entityType: "QuestGoal", entityId: goal.id });

  const context = await buildUserContext(userId, { goalId: goal.id });
  const analysis = await analyzeGoal({ title: goal.title, description: goal.description, context });
  if (analysis.clarifyingQuestions.length > 0) {
    return { status: "NEEDS_ANSWERS" as const, goal, clarifyingQuestions: analysis.clarifyingQuestions };
  }

  const plan = await finalizeGoalAnalysisAndPlan(userId, goal.id, analysis);
  return { status: "READY" as const, ...plan };
}

export async function submitClarifyingAnswers(userId: string, goalId: string, answers: ClarifyingAnswer[]) {
  const goal = await requireOwnedGoal(userId, goalId);
  const context = await buildUserContext(userId, { goalId });
  const analysis = await analyzeGoal({ title: goal.title, description: goal.description, answers, context });
  const plan = await finalizeGoalAnalysisAndPlan(userId, goalId, analysis);
  return { status: "READY" as const, ...plan };
}

export async function listGoals(userId: string) {
  return prisma.questGoal.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
  });
}

export async function getGoalDetail(userId: string, goalId: string) {
  const goal = await requireOwnedGoal(userId, goalId);
  const [milestones, quests] = await Promise.all([
    prisma.questMilestone.findMany({ where: { goalId }, orderBy: { order: "asc" } }),
    prisma.quest.findMany({ where: { goalId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { goal, milestones, quests };
}

export async function setGoalStatus(userId: string, goalId: string, status: "ACTIVE" | "PAUSED" | "ABANDONED" | "ARCHIVED") {
  await requireOwnedGoal(userId, goalId);
  const updated = await prisma.questGoal.update({ where: { id: goalId }, data: { status } });
  await writeQuestAuditLog({ userId, action: `goal.status_changed.${status.toLowerCase()}`, entityType: "QuestGoal", entityId: goalId });
  return updated;
}
