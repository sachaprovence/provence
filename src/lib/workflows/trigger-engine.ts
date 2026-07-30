import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { subscribeDomainEvent } from "@/lib/events/domain-events";
import { createWorkflowRun, executeWorkflowRun } from "./execution-engine";
import { matchesCron } from "./triggers/cron";
import { WorkflowDefinitionStatus } from "@/generated/prisma/enums";

/**
 * Point de dispatch des déclencheurs (voir brief v0.6) : un évènement
 * applicatif (`triggerWorkflowsForEvent`), un webhook (`triggerWorkflowWebhook`),
 * une planification cron évaluée à chaque appel (`processDueWorkflowCronTriggers`)
 * — supposé appelé au plus une fois par minute par l'infrastructure de cron
 * (même hypothèse implicite que `AgentSchedule`, v0.3), et l'abonnement à la
 * fin d'exécution d'un agent (`subscribeAgentRunFinishedTrigger`, via le bus
 * d'évènements — zéro dépendance de compilation vers
 * `agents/execution-engine.ts`, voir ADR 0018).
 */

async function fireBinding(binding: { workflowDefinitionId: string; workflowVersionId: string; workspaceId: string; nodeId: string }, triggerKey: string, payload: unknown) {
  const definition = await prisma.workflowDefinition.findUnique({ where: { id: binding.workflowDefinitionId } });
  if (!definition || definition.status !== WorkflowDefinitionStatus.ACTIVE || !definition.organizationId) return;

  const run = await createWorkflowRun({
    organizationId: definition.organizationId,
    workspaceId: binding.workspaceId,
    workflowDefinitionId: binding.workflowDefinitionId,
    workflowVersionId: binding.workflowVersionId,
    input: payload,
    trigger: "EVENT",
    triggerKey,
  });
  await executeWorkflowRun(run.id).catch((error) => {
    logger.error({ module: "workflow-trigger-engine", runId: run.id, triggerKey, err: error }, "Échec du déclenchement d'un workflow.");
  });
}

/** Déclenche tous les workflows actifs abonnés à `eventKey` (ex. "prospect.created", "quote.signed", "workflow.completed"...). */
export async function triggerWorkflowsForEvent(eventKey: string, payload?: unknown): Promise<{ triggered: number }> {
  const bindings = await prisma.workflowTriggerBinding.findMany({
    where: { triggerKey: eventKey, isActive: true, workflowDefinition: { status: WorkflowDefinitionStatus.ACTIVE } },
  });
  for (const binding of bindings) await fireBinding(binding, eventKey, payload);
  return { triggered: bindings.length };
}

/** Déclenchement webhook : cible UN SEUL workflow (par workspace + clé), jamais une diffusion. */
export async function triggerWorkflowWebhook(workspaceId: string, workflowKey: string, payload: unknown) {
  const definition = await prisma.workflowDefinition.findFirst({
    where: { workspaceId, key: workflowKey, status: WorkflowDefinitionStatus.ACTIVE },
  });
  if (!definition?.activeVersionId) {
    throw new NotFoundError(`Aucun workflow actif "${workflowKey}" dans ce workspace.`);
  }
  const binding = await prisma.workflowTriggerBinding.findFirst({
    where: { workflowDefinitionId: definition.id, triggerKey: "webhook.received", isActive: true },
  });
  if (!binding) {
    throw new ValidationError(`Le workflow "${workflowKey}" n'a pas de déclencheur webhook actif.`);
  }
  await fireBinding(binding, "webhook.received", payload);
  return { workflowDefinitionId: definition.id };
}

/** Évalue toutes les planifications cron actives — voir `triggers/cron.ts` pour l'analyseur. */
export async function processDueWorkflowCronTriggers(now: Date = new Date()): Promise<{ triggered: number }> {
  const bindings = await prisma.workflowTriggerBinding.findMany({
    where: { triggerKey: "schedule.cron", isActive: true, workflowDefinition: { status: WorkflowDefinitionStatus.ACTIVE } },
  });
  let triggered = 0;
  for (const binding of bindings) {
    const config = binding.config as { cronExpression?: string } | null;
    if (!config?.cronExpression) continue;
    try {
      if (matchesCron(config.cronExpression, now)) {
        await fireBinding(binding, "schedule.cron", { firedAt: now.toISOString() });
        triggered += 1;
      }
    } catch (error) {
      logger.warn({ module: "workflow-trigger-engine", bindingId: binding.id, err: error }, "Expression cron invalide — déclencheur ignoré.");
    }
  }
  return { triggered };
}

let subscribed = false;

/** Abonnement (idempotent) au bus d'évènements pour le déclencheur "Exécution d'un agent" — voir `bootstrap.ts`. */
export function subscribeAgentRunFinishedTrigger(): void {
  if (subscribed) return;
  subscribeDomainEvent("agent_run.finished", async (payload) => {
    await triggerWorkflowsForEvent("agent.run.completed", payload);
  });
  subscribed = true;
}
