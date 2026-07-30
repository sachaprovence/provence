import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createAgentRun, runAgentToCompletion } from "@/lib/agents/execution-engine";
import { resolveActiveInstallation } from "@/lib/agents/installation-service";
import { AgentRunTrigger } from "@/generated/prisma/enums";
import type { WorkflowActionHandler } from "../registry";

/**
 * Point d'intégration entre le Workflow Engine et le Framework des Agents.
 * Générique par construction : cible n'importe quel agent installé (par
 * installation ou par catégorie, même résolution que
 * `director/delegation-engine.ts#resolveTargetInstallation`), pas
 * seulement le Commercial — c'est délibérément la SEULE façon dont un
 * workflow parle à un agent, jamais d'import direct d'un service métier
 * d'agent (`commercial-service.ts` etc.) depuis ce module : l'input passé
 * ici doit respecter le contrat d'entrée que l'agent cible attend
 * lui-même (voir `definitions/commercial-agent.ts` par exemple), exactement
 * comme le Director délègue déjà — voir ADR 0018.
 */
type AgentCallInput = {
  installationId?: string;
  category?: string;
  input?: unknown;
  timeoutMs?: number;
  maxAttempts?: number;
};

export const agentCallAction: WorkflowActionHandler<
  AgentCallInput,
  { runId: string; status: string; output: unknown; error: unknown }
> = {
  key: "agent.call",
  name: "Appeler un agent",
  description: "Délègue une tâche à un agent installé (par installation ou par catégorie) et attend son résultat.",
  category: "agents",
  async execute(input, context) {
    if (!input.installationId && !input.category) {
      throw new ValidationError('L\'action "agent.call" nécessite "installationId" ou "category".');
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
