import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { createAgentRun, cancelAgentRun, runAgentToCompletion } from "@/lib/agents/execution-engine";
import { sendAgentMessage, markMessageDelivered } from "@/lib/agents/messaging";
import { resolveActiveInstallation } from "@/lib/agents/installation-service";
import { updateStepStatus } from "./planning-engine";
import { AgentPlanStepStatus, AgentRunTrigger, AgentMessageType } from "@/generated/prisma/enums";
import type { AgentInstallation, AgentPlanStep, AgentRunStatus } from "@/generated/prisma/client";

/**
 * Moteur de délégation du Director (v0.4) : appeler un agent, attendre son
 * résultat, l'annuler, le relancer. Ne réimplémente jamais l'exécution
 * elle-même — reprend systématiquement `createAgentRun`/`executeAgentRun`/
 * `cancelAgentRun` (v0.3) et `sendAgentMessage` pour l'historisation, jamais
 * de contournement. Voir ADR 0010 pour la justification du pilotage
 * synchrone intra-processus (pas de file distribuée à ce stade).
 */

const DEFAULT_DELEGATION_TIMEOUT_MS = 30_000;
const DEFAULT_DELEGATION_MAX_ATTEMPTS = 1;

const CANCELLABLE_STEP_STATUSES = new Set<string>(["PENDING", "READY", "DELEGATED", "RUNNING"]);
const RETRYABLE_STEP_STATUSES = new Set<string>(["FAILED", "CANCELLED"]);

type DirectorRef = Pick<AgentInstallation, "id" | "workspaceId" | "organizationId">;

async function resolveTargetInstallation(director: DirectorRef, step: AgentPlanStep) {
  return resolveActiveInstallation({
    workspaceId: director.workspaceId,
    installationId: step.targetInstallationId,
    category: step.targetCategory,
    excludeInstallationId: director.id,
  });
}

function missingGrants(step: AgentPlanStep, target: { grantedToolKeys: string[]; grantedPermissions: string[] }) {
  const missingTools = step.requiredToolKeys.filter((key) => !target.grantedToolKeys.includes(key));
  const missingPermissions = step.requiredPermissions.filter((p) => !target.grantedPermissions.includes(p));
  return { missingTools, missingPermissions };
}

function mapRunStatusToStepStatus(runStatus: AgentRunStatus): AgentPlanStepStatus {
  if (runStatus === "SUCCEEDED") return AgentPlanStepStatus.SUCCEEDED;
  if (runStatus === "CANCELLED") return AgentPlanStepStatus.CANCELLED;
  return AgentPlanStepStatus.FAILED; // FAILED ou TIMED_OUT
}

/**
 * Délègue une étape : résout l'agent cible, vérifie qu'il détient les
 * outils/permissions requis, crée et exécute son `AgentRun`, historise la
 * demande et la réponse (`AgentMessage`), et renvoie l'étape mise à jour
 * avec son statut final. Ne lève jamais d'exception pour un échec de
 * délégation (agent introuvable, permissions manquantes, échec
 * d'exécution) — l'échec est toujours capturé dans `step.error`, jamais
 * propagé, pour que le Director puisse continuer les autres étapes
 * indépendantes du plan.
 */
export async function delegateStep(
  director: DirectorRef,
  step: AgentPlanStep,
  opts: { maxAttempts?: number; timeoutMs?: number; parentRunId?: string } = {}
): Promise<AgentPlanStep> {
  const startedAt = new Date();

  try {
    const target = await resolveTargetInstallation(director, step);
    if (!target) {
      return await updateStepStatus(step.id, {
        status: AgentPlanStepStatus.FAILED,
        startedAt,
        finishedAt: new Date(),
        error: {
          message: step.targetInstallationId
            ? `Aucun agent actif trouvé pour l'installation "${step.targetInstallationId}".`
            : `Aucun agent actif disponible pour la catégorie "${step.targetCategory}".`,
        },
      });
    }

    const { missingTools, missingPermissions } = missingGrants(step, target);
    if (missingTools.length > 0 || missingPermissions.length > 0) {
      return await updateStepStatus(step.id, {
        status: AgentPlanStepStatus.FAILED,
        targetInstallationId: target.id,
        startedAt,
        finishedAt: new Date(),
        error: {
          message: "L'agent cible ne dispose pas des droits requis pour cette étape.",
          missingTools,
          missingPermissions,
        },
      });
    }

    await updateStepStatus(step.id, {
      status: AgentPlanStepStatus.DELEGATED,
      targetInstallationId: target.id,
      startedAt,
    });

    const subRun = await createAgentRun({
      installationId: target.id,
      input: step.input ?? { objective: step.objective },
      trigger: AgentRunTrigger.AGENT,
      priority: step.priority,
      maxAttempts: opts.maxAttempts ?? DEFAULT_DELEGATION_MAX_ATTEMPTS,
      timeoutMs: opts.timeoutMs ?? DEFAULT_DELEGATION_TIMEOUT_MS,
      parentRunId: opts.parentRunId,
    });

    const requestMessage = await sendAgentMessage({
      workspaceId: director.workspaceId,
      fromInstallationId: director.id,
      toInstallationId: target.id,
      runId: subRun.id,
      type: AgentMessageType.TASK_REQUEST,
      payload: { stepId: step.id, objective: step.objective, input: step.input },
    });
    await markMessageDelivered(requestMessage.id);

    await updateStepStatus(step.id, { subRunId: subRun.id, status: AgentPlanStepStatus.RUNNING });

    await runAgentToCompletion(subRun.id);

    const finishedRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: subRun.id } });
    const finishedAt = new Date();
    const stepStatus = mapRunStatusToStepStatus(finishedRun.status);

    await sendAgentMessage({
      workspaceId: director.workspaceId,
      fromInstallationId: target.id,
      toInstallationId: director.id,
      runId: subRun.id,
      type: stepStatus === AgentPlanStepStatus.SUCCEEDED ? AgentMessageType.RESULT : AgentMessageType.ERROR,
      payload:
        stepStatus === AgentPlanStepStatus.SUCCEEDED
          ? { stepId: step.id, output: finishedRun.output }
          : { stepId: step.id, error: finishedRun.error },
    });

    return await updateStepStatus(step.id, {
      status: stepStatus,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      result: finishedRun.output,
      error: finishedRun.error,
    });
  } catch (error) {
    return updateStepStatus(step.id, {
      status: AgentPlanStepStatus.FAILED,
      startedAt,
      finishedAt: new Date(),
      error: { message: error instanceof Error ? error.message : String(error) },
    });
  }
}

/** Interrompt une étape déléguée : annule le run sous-jacent s'il existe et n'est pas déjà terminé. */
export async function cancelStepDelegation(step: AgentPlanStep): Promise<AgentPlanStep> {
  if (!CANCELLABLE_STEP_STATUSES.has(step.status)) {
    throw new ValidationError(`Impossible d'annuler une étape au statut "${step.status}".`);
  }

  if (step.subRunId) {
    await cancelAgentRun(step.subRunId).catch((error) => {
      if (!(error instanceof ValidationError)) throw error; // déjà terminée (course bénigne) — on ignore.
    });
  }

  return updateStepStatus(step.id, { status: AgentPlanStepStatus.CANCELLED, finishedAt: new Date() });
}

/**
 * Relance une étape échouée ou annulée : repart d'un état PENDING propre et
 * redélègue, en reliant explicitement le nouveau run au précédent via
 * `AgentRun.parentRunId` (lignée de reprise visible dans le graphe).
 */
export async function retryStepDelegation(
  director: DirectorRef,
  step: AgentPlanStep,
  opts: { maxAttempts?: number; timeoutMs?: number } = {}
): Promise<AgentPlanStep> {
  if (!RETRYABLE_STEP_STATUSES.has(step.status)) {
    throw new ValidationError(`Impossible de relancer une étape au statut "${step.status}".`);
  }

  const previousSubRunId = step.subRunId;
  const reset = await updateStepStatus(step.id, {
    status: AgentPlanStepStatus.PENDING,
    subRunId: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    result: null,
    error: null,
  });

  return delegateStep(director, reset, { ...opts, parentRunId: previousSubRunId ?? undefined });
}
