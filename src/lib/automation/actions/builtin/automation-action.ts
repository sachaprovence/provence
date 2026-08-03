import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createAutomationRun } from "@/lib/automation/registry/automation-service";
import type { AutomationJobHandler } from "../registry";

type AutomationCallInput = { automationKey: string; input?: Record<string, unknown> };

/**
 * Lance une autre automatisation, de façon ASYNCHRONE — crée le run
 * (`QUEUED`) et renvoie immédiatement son identifiant, sans attendre son
 * résultat. Différence assumée avec `workflow.call`/le "sous-workflow" du
 * Workflow Engine (synchrones) : l'exécution de l'Automation Engine
 * délègue toujours au Job Executor via le noyau de jobs, jamais un
 * pilotage bloquant en ligne — voir ADR 0031.
 */
export const automationCallAction: AutomationJobHandler<AutomationCallInput, { runId: string; status: string }> = {
  key: "automation.call",
  name: "Appeler une automatisation",
  description: "Déclenche une autre automatisation active (par clé) — asynchrone, ne bloque pas en attendant son résultat.",
  category: "orchestration",
  async execute(input, context) {
    if (!input.automationKey?.trim()) {
      throw new ValidationError('Le job "automation.call" nécessite "automationKey".');
    }
    const target = await prisma.automation.findFirst({
      where: { workspaceId: context.workspaceId, key: input.automationKey, status: "ACTIVE" },
    });
    if (!target?.activeVersionId) {
      throw new NotFoundError(`Aucune automatisation active trouvée pour la clé "${input.automationKey}".`);
    }

    const run = await createAutomationRun({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      automationId: target.id,
      automationVersionId: target.activeVersionId,
      input: input.input,
      trigger: "AUTOMATION",
      parentRunId: context.runId,
    });

    await context.log("info", `Automatisation "${input.automationKey}" déclenchée (run "${run.id}", asynchrone).`);
    return { runId: run.id, status: run.status };
  },
};
