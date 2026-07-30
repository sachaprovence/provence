import "server-only";
import { prisma } from "@/lib/prisma";
import { AgentInstallationStatus, AgentRunStatus } from "@/generated/prisma/enums";
import type { AgentPlanStepStatus as AgentPlanStepStatusType } from "@/generated/prisma/enums";
import { listPlans, resolvePlanOrThrow } from "./planning-engine";
import { listMessages } from "@/lib/agents/messaging";
import { getWorkspaceAgentStats } from "@/lib/agents/observability";
import { DIRECTOR_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/director-agent";

/**
 * Agrégations pour le tableau de bord et le graphe du Director (v0.4).
 * Aucune nouvelle table de métriques : tout est calculé à la lecture à
 * partir des tables déjà existantes (`AgentInstallation`, `AgentRun`,
 * `AgentPlan`/`AgentPlanStep`, `AgentSchedule`, `AgentMessage`,
 * `AIRequest`) — même principe que `observability.ts` (v0.3).
 */

export async function resolveDirectorInstallation(workspaceId: string) {
  return prisma.agentInstallation.findFirst({
    where: { workspaceId, definition: { runtimeKey: DIRECTOR_AGENT_RUNTIME_KEY } },
    include: { definition: true },
  });
}

export async function getDirectorDashboard(workspaceId: string) {
  const [activeAgents, stepStatusCounts, queuedRuns, activeSchedules, recentPlans, recentMessages, consumption] =
    await Promise.all([
      prisma.agentInstallation.findMany({
        where: { workspaceId, status: AgentInstallationStatus.ACTIVE },
        include: { definition: true },
        orderBy: { installedAt: "asc" },
      }),
      prisma.agentPlanStep.groupBy({ by: ["status"], where: { plan: { workspaceId } }, _count: { _all: true } }),
      prisma.agentRun.count({ where: { installation: { workspaceId }, status: AgentRunStatus.QUEUED } }),
      prisma.agentSchedule.findMany({
        where: { installation: { workspaceId }, isActive: true },
        orderBy: { nextRunAt: "asc" },
        take: 10,
        include: { installation: { include: { definition: true } } },
      }),
      listPlans({ workspaceId, limit: 20 }),
      listMessages({ workspaceId, limit: 30 }),
      getWorkspaceAgentStats(workspaceId),
    ]);

  const counts = Object.fromEntries(stepStatusCounts.map((row) => [row.status, row._count._all])) as Partial<
    Record<AgentPlanStepStatusType, number>
  >;

  return {
    activeAgents,
    tasks: {
      pending:
        (counts.PENDING ?? 0) +
        (counts.READY ?? 0) +
        (counts.DELEGATED ?? 0) +
        (counts.RUNNING ?? 0),
      completed: counts.SUCCEEDED ?? 0,
      failed: counts.FAILED ?? 0,
      skipped: counts.SKIPPED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
    },
    queuedRuns,
    activeSchedules,
    recentPlans,
    recentMessages,
    consumption,
  };
}

export type PlanGraphNode =
  | { id: string; kind: "director"; label: string }
  | { id: string; kind: "step"; label: string; status: AgentPlanStepStatusType; targetLabel: string; stepIndex: number };

export type PlanGraphEdge = { from: string; to: string; kind: "delegation" | "dependency" };

/** Nœuds/arêtes pour la visualisation graphique d'un plan (Director + étapes + dépendances). */
export async function getPlanGraph(workspaceId: string, planId: string) {
  const plan = await resolvePlanOrThrow(workspaceId, planId);

  const targetIds = Array.from(
    new Set(plan.steps.map((step) => step.targetInstallationId).filter((id): id is string => !!id))
  );
  const targets = await prisma.agentInstallation.findMany({
    where: { id: { in: targetIds } },
    include: { definition: true },
  });
  const targetById = new Map(targets.map((target) => [target.id, target]));

  const directorNodeId = `installation:${plan.installationId}`;
  const nodes: PlanGraphNode[] = [{ id: directorNodeId, kind: "director", label: "Director" }];
  const edges: PlanGraphEdge[] = [];

  for (const step of plan.steps) {
    const stepNodeId = `step:${step.id}`;
    const targetLabel = step.targetInstallationId
      ? (targetById.get(step.targetInstallationId)?.definition.name ?? step.targetInstallationId)
      : (step.targetCategory ?? "?");

    nodes.push({
      id: stepNodeId,
      kind: "step",
      label: step.objective,
      status: step.status,
      targetLabel,
      stepIndex: step.stepIndex,
    });
    edges.push({ from: directorNodeId, to: stepNodeId, kind: "delegation" });
    for (const depId of step.dependsOnStepIds) {
      edges.push({ from: `step:${depId}`, to: stepNodeId, kind: "dependency" });
    }
  }

  return { plan, nodes, edges };
}
