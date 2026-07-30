import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createAgentRun, runAgentToCompletion } from "@/lib/agents/execution-engine";
import { resolveActiveInstallation } from "@/lib/agents/installation-service";
import { AgentRunTrigger } from "@/generated/prisma/enums";
import type { AutomationJobHandler } from "../registry";

/**
 * Même point d'intégration que `workflows/actions/builtin/agent-action.ts`
 * (v0.6) avec le Framework des Agents — générique par construction
 * (installation ou catégorie), jamais d'import direct d'un service métier
 * d'agent. Dupliqué délibérément plutôt que partagé : les deux moteurs
 * gardent des interfaces de contexte découplées (voir ADR 0031).
 */
type AgentCallInput = { installationId?: string; category?: string; input?: unknown; timeoutMs?: number; maxAttempts?: number };

export const agentCallAction: AutomationJobHandler<AgentCallInput, { runId: string; status: string; output: unknown; error: unknown }> = {
  key: "agent.call",
  name: "Appeler un agent",
  description: "Délègue une tâche à un agent installé (par installation ou par catégorie) et attend son résultat.",
  category: "agents",
  async execute(input, context) {
    if (!input.installationId && !input.category) {
      throw new ValidationError('Le job "agent.call" nécessite "installationId" ou "category".');
    }
    const target = await resolveActiveInstallation({
      workspaceId: context.workspaceId,
      installationId: input.installationId,
      category: input.category,
    });
    if (!target) {
      throw new NotFoundError(
        input.installationId
          ? `Aucun agent actif trouvé pour l'installation "${input.installationId}".`
          : `Aucun agent actif disponible pour la catégorie "${input.category}".`
      );
    }

    const run = await createAgentRun({
      installationId: target.id,
      input: input.input,
      trigger: AgentRunTrigger.AGENT,
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts,
    });
    await context.log("info", `Appel de l'agent "${target.id}" (run "${run.id}").`);
    await runAgentToCompletion(run.id);

    const finished = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    return { runId: finished.id, status: finished.status, output: finished.output, error: finished.error };
  },
};
