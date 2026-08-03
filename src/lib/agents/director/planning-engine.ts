import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { AgentPlanStatus, AgentPlanStepStatus } from "@/generated/prisma/enums";
import type { AgentPlanStep } from "@/generated/prisma/client";

/**
 * Moteur de planification du Director (v0.4) : transforme une demande en un
 * graphe d'étapes (DAG) persistant, piloté par le moteur de délégation
 * (`delegation-engine.ts`). Toute la structure du plan (dépendances,
 * priorités, statuts, durée, résultat) est stockée en base — jamais en
 * mémoire du process — pour rester consultable depuis le tableau de bord et
 * survivre à un redémarrage du serveur. Voir ADR 0010.
 */
export type PlanStepInput = {
  objective: string;
  /** Installation cible déjà connue (résolution explicite). */
  targetInstallationId?: string;
  /** Catégorie d'agent à résoudre dynamiquement à la délégation si `targetInstallationId` est absent. */
  targetCategory?: string;
  priority?: number;
  /** Index (dans ce même tableau `steps`) des étapes dont celle-ci dépend — doit toujours référencer un index strictement inférieur. */
  dependsOn?: number[];
  requiredToolKeys?: string[];
  requiredPermissions?: string[];
  input?: unknown;
};

/**
 * Crée un plan et ses étapes dans une transaction. La validation des
 * dépendances (`dependsOn` ne peut référencer qu'un index strictement
 * inférieur à l'étape courante) exclut trivialement tout cycle — un DAG
 * valide se construit alors uniquement par des références vers l'arrière.
 */
export async function createPlan(params: {
  workspaceId: string;
  installationId: string;
  runId?: string | null;
  goal: string;
  steps: PlanStepInput[];
}) {
  if (params.steps.length === 0) {
    throw new ValidationError("Un plan doit contenir au moins une étape.");
  }

  params.steps.forEach((step, index) => {
    for (const depIndex of step.dependsOn ?? []) {
      if (depIndex < 0 || depIndex >= index) {
        throw new ValidationError(
          `L'étape ${index} a une dépendance invalide (${depIndex}) : une étape ne peut dépendre que d'une étape qui la précède.`
        );
      }
    }
    if (!step.targetInstallationId && !step.targetCategory) {
      throw new ValidationError(
        `L'étape ${index} doit préciser une installation cible (targetInstallationId) ou une catégorie cible (targetCategory).`
      );
    }
  });

  return prisma.$transaction(async (tx) => {
    const plan = await tx.agentPlan.create({
      data: {
        workspaceId: params.workspaceId,
        installationId: params.installationId,
        runId: params.runId ?? null,
        goal: params.goal,
        status: AgentPlanStatus.DRAFT,
      },
    });

    const createdIds: string[] = [];
    for (let index = 0; index < params.steps.length; index += 1) {
      const step = params.steps[index];
      const created = await tx.agentPlanStep.create({
        data: {
          planId: plan.id,
          stepIndex: index,
          objective: step.objective,
          targetInstallationId: step.targetInstallationId ?? null,
          targetCategory: step.targetCategory ?? null,
          priority: step.priority ?? 0,
          requiredToolKeys: step.requiredToolKeys ?? [],
          requiredPermissions: step.requiredPermissions ?? [],
          input: (step.input ?? null) as never,
          dependsOnStepIds: (step.dependsOn ?? []).map((depIndex) => createdIds[depIndex]),
        },
      });
      createdIds.push(created.id);
    }

    return tx.agentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
  });
}

export async function getPlan(planId: string) {
  const plan = await prisma.agentPlan.findUnique({
    where: { id: planId },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
  if (!plan) throw new NotFoundError("Plan introuvable.");
  return plan;
}

/** Filtre STRICTEMENT par workspace — même principe que `resolveInstallationOrThrow` (v0.2/v0.3). */
export async function resolvePlanOrThrow(workspaceId: string, planId: string) {
  const plan = await prisma.agentPlan.findFirst({
    where: { id: planId, workspaceId },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
  if (!plan) throw new NotFoundError("Plan introuvable.");
  return plan;
}

export async function listPlans(params: { workspaceId: string; installationId?: string; limit?: number }) {
  return prisma.agentPlan.findMany({
    where: { workspaceId: params.workspaceId, installationId: params.installationId },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
}

export async function markPlanRunning(planId: string) {
  return prisma.agentPlan.update({
    where: { id: planId },
    data: { status: AgentPlanStatus.RUNNING, startedAt: new Date() },
  });
}

export async function markPlanFinished(planId: string, status: "SUCCEEDED" | "FAILED" | "CANCELLED") {
  return prisma.agentPlan.update({
    where: { id: planId },
    data: { status, finishedAt: new Date() },
  });
}

export async function updateStepStatus(
  stepId: string,
  data: Partial<{
    status: AgentPlanStepStatus;
    targetInstallationId: string | null;
    subRunId: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationMs: number | null;
    result: unknown;
    error: unknown;
  }>
) {
  return prisma.agentPlanStep.update({
    where: { id: stepId },
    data: {
      ...data,
      result: data.result !== undefined ? (data.result as never) : undefined,
      error: data.error !== undefined ? (data.error as never) : undefined,
    },
  });
}

/**
 * Renvoie les étapes prêtes à être déléguées (dépendances toutes
 * `SUCCEEDED`), triées par priorité décroissante. Effet de bord documenté :
 * une étape `PENDING` dont au moins une dépendance a échoué/a été annulée
 * est immédiatement basculée en `SKIPPED` (propagation d'échec en cascade)
 * plutôt que de rester bloquée indéfiniment — c'est le mécanisme qui
 * garantit la terminaison de la boucle d'exécution du Director.
 */
export async function getReadySteps(planId: string): Promise<AgentPlanStep[]> {
  const steps = await prisma.agentPlanStep.findMany({ where: { planId } });
  const byId = new Map(steps.map((step) => [step.id, step]));
  const ready: AgentPlanStep[] = [];

  for (const step of steps) {
    if (step.status !== AgentPlanStepStatus.PENDING) continue;

    const deps = step.dependsOnStepIds.map((id) => byId.get(id)).filter((dep): dep is AgentPlanStep => !!dep);
    const blocked = deps.some(
      (dep) =>
        dep.status === AgentPlanStepStatus.FAILED ||
        dep.status === AgentPlanStepStatus.CANCELLED ||
        dep.status === AgentPlanStepStatus.SKIPPED
    );
    if (blocked) {
      await updateStepStatus(step.id, {
        status: AgentPlanStepStatus.SKIPPED,
        error: { message: "Étape ignorée : une dépendance a échoué ou a été annulée." },
        finishedAt: new Date(),
      });
      continue;
    }

    if (deps.every((dep) => dep.status === AgentPlanStepStatus.SUCCEEDED)) {
      ready.push(step);
    }
  }

  return ready.sort((a, b) => b.priority - a.priority);
}

/** Nombre d'étapes encore actionnables (le Director doit continuer sa boucle tant que ce nombre est > 0). */
export async function countPendingSteps(planId: string): Promise<number> {
  return prisma.agentPlanStep.count({
    where: { planId, status: { in: [AgentPlanStepStatus.PENDING, AgentPlanStepStatus.READY] } },
  });
}

export type MergedPlanResult = {
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  steps: {
    stepIndex: number;
    objective: string;
    status: AgentPlanStepStatus;
    result: unknown;
    error: unknown;
  }[];
};

/** Fusionne les résultats de toutes les étapes d'un plan terminé — la "fusion des résultats" du Director. */
export function mergePlanResults(plan: { steps: AgentPlanStep[] }): MergedPlanResult {
  const steps = [...plan.steps].sort((a, b) => a.stepIndex - b.stepIndex);
  return {
    succeededCount: steps.filter((s) => s.status === AgentPlanStepStatus.SUCCEEDED).length,
    failedCount: steps.filter((s) => s.status === AgentPlanStepStatus.FAILED).length,
    skippedCount: steps.filter((s) => s.status === AgentPlanStepStatus.SKIPPED).length,
    steps: steps.map((s) => ({
      stepIndex: s.stepIndex,
      objective: s.objective,
      status: s.status,
      result: s.result,
      error: s.error,
    })),
  };
}
