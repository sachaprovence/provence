import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createWorkflowRun, runWorkflowToCompletion } from "@/lib/workflows/execution-engine";
import { WorkflowDefinitionStatus } from "@/generated/prisma/enums";
import type { AutomationJobHandler } from "../registry";

type WorkflowCallInput = { workflowKey: string; input?: Record<string, unknown> };

/**
 * Point d'intégration entre l'Automation Engine et le Workflow Engine
 * (v0.6, non modifié) : lance un workflow actif (par clé) et attend son
 * résultat de façon synchrone, en réutilisant directement ses fonctions
 * publiques (`createWorkflowRun`/`runWorkflowToCompletion`) — jamais
 * d'accès à ses tables internes. Voir ADR 0031.
 */
export const workflowCallAction: AutomationJobHandler<WorkflowCallInput, unknown> = {
  key: "workflow.call",
  name: "Appeler un workflow",
  description: "Exécute un workflow actif (Workflow Engine, v0.6) par clé et attend son résultat.",
  category: "orchestration",
  async execute(input, context) {
    if (!input.workflowKey?.trim()) {
      throw new ValidationError('Le job "workflow.call" nécessite "workflowKey".');
    }
    const target = await prisma.workflowDefinition.findFirst({
      where: { workspaceId: context.workspaceId, key: input.workflowKey, status: WorkflowDefinitionStatus.ACTIVE },
    });
    if (!target?.activeVersionId) {
      throw new NotFoundError(`Aucun workflow actif trouvé pour la clé "${input.workflowKey}".`);
    }

    const run = await createWorkflowRun({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      workflowDefinitionId: target.id,
      workflowVersionId: target.activeVersionId,
      input: input.input,
      trigger: "API",
    });

    await context.log("info", `Workflow "${input.workflowKey}" lancé (run "${run.id}").`);
    const finished = await runWorkflowToCompletion(run.id);

    if (finished.status === "WAITING") {
      throw new Error('Le workflow appelé est passé en attente — la reprise synchrone n\'est pas prise en charge depuis un job (voir ADR 0019).');
    }
    if (finished.status !== "SUCCEEDED") {
      throw new Error(`Le workflow "${input.workflowKey}" a échoué : ${JSON.stringify(finished.error)}`);
    }
    return finished.output;
  },
};
