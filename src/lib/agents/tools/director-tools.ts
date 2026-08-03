import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { AgentInstallationStatus } from "@/generated/prisma/enums";
import { delegateStep, cancelStepDelegation, retryStepDelegation } from "@/lib/agents/director/delegation-engine";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils catégorie "director" (registre unique, voir `tool-registry.ts`) :
 * c'est par ces outils, et uniquement par eux, que le runtime du Director
 * (`src/lib/agents/definitions/director-agent.ts`) délègue, annule ou
 * relance une tâche — jamais d'appel direct à `delegation-engine.ts` en
 * dehors d'un outil, pour que chaque action de délégation passe par la même
 * vérification de permission (`requireAgentToolPermission`, appliquée par
 * `context.callTool`) que n'importe quel autre outil du framework.
 */

/** Une étape ne peut être manipulée que par le Director qui possède le plan auquel elle appartient — jamais par un autre agent. */
async function loadOwnedStep(installationId: string, stepId: string) {
  const step = await prisma.agentPlanStep.findFirst({
    where: { id: stepId, plan: { installationId } },
  });
  if (!step) throw new NotFoundError("Étape de plan introuvable.");
  return step;
}

export const listAvailableAgentsTool: ToolHandler<
  { category?: string } | undefined,
  {
    agents: {
      installationId: string;
      definitionKey: string;
      name: string;
      category: string;
      grantedToolKeys: string[];
      grantedPermissions: string[];
    }[];
  }
> = {
  key: "director.list_agents",
  async handle(input, { installation }) {
    const agents = await prisma.agentInstallation.findMany({
      where: {
        workspaceId: installation.workspaceId,
        status: AgentInstallationStatus.ACTIVE,
        id: { not: installation.id },
        definition: input?.category ? { category: input.category } : undefined,
      },
      include: { definition: true },
      orderBy: { installedAt: "asc" },
    });

    return {
      agents: agents.map((agent) => ({
        installationId: agent.id,
        definitionKey: agent.definition.key,
        name: agent.definition.name,
        category: agent.definition.category,
        grantedToolKeys: agent.grantedToolKeys,
        grantedPermissions: agent.grantedPermissions,
      })),
    };
  },
};

export const delegateTaskTool: ToolHandler<
  { stepId: string; maxAttempts?: number; timeoutMs?: number },
  { stepId: string; status: string; result: unknown; error: unknown }
> = {
  key: "director.delegate_task",
  async handle(input, { installation }) {
    const step = await loadOwnedStep(installation.id, input.stepId);
    const updated = await delegateStep(installation, step, {
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
    });
    return { stepId: updated.id, status: updated.status, result: updated.result, error: updated.error };
  },
};

export const cancelTaskTool: ToolHandler<{ stepId: string }, { stepId: string; status: string }> = {
  key: "director.cancel_task",
  async handle(input, { installation }) {
    const step = await loadOwnedStep(installation.id, input.stepId);
    const updated = await cancelStepDelegation(step);
    return { stepId: updated.id, status: updated.status };
  },
};

export const retryTaskTool: ToolHandler<
  { stepId: string; maxAttempts?: number; timeoutMs?: number },
  { stepId: string; status: string; result: unknown; error: unknown }
> = {
  key: "director.retry_task",
  async handle(input, { installation }) {
    const step = await loadOwnedStep(installation.id, input.stepId);
    const updated = await retryStepDelegation(installation, step, {
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
    });
    return { stepId: updated.id, status: updated.status, result: updated.result, error: updated.error };
  },
};

export const directorTools: ToolHandler[] = [listAvailableAgentsTool, delegateTaskTool, cancelTaskTool, retryTaskTool];
