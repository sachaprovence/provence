import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createWorkflowRun, runWorkflowToCompletion } from "../../execution-engine";
import { WorkflowDefinitionStatus } from "@/generated/prisma/enums";
import type { WorkflowActionHandler } from "../registry";

type SubworkflowInput = { workflowKey: string; input?: Record<string, unknown> };

/**
 * Lance un autre workflow (par clé, dans le même workspace) et attend son
 * résultat de façon synchrone — même principe de pilotage synchrone
 * intra-processus que le Director (v0.4, ADR 0010), réappliqué ici. Si le
 * sous-workflow passe en `WAITING` (noeud d'attente/délai), cette action
 * échoue explicitement plutôt que de bloquer indéfiniment ou de simuler
 * une reprise qui n'est pas implémentée — voir ADR 0019.
 */
export const subworkflowRunAction: WorkflowActionHandler<SubworkflowInput, unknown> = {
  key: "workflow.run_subworkflow",
  name: "Lancer un sous-workflow",
  description: "Exécute un autre workflow (par clé) et attend son résultat.",
  category: "orchestration",
  async execute(input, context) {
    if (!input.workflowKey?.trim()) {
      throw new ValidationError('L\'action "workflow.run_subworkflow" nécessite "workflowKey".');
    }
    const target = await prisma.workflowDefinition.findFirst({
      where: { workspaceId: context.workspaceId, key: input.workflowKey, status: WorkflowDefinitionStatus.ACTIVE },
    });
    if (!target?.activeVersionId) {
      throw new NotFoundError(`Aucun workflow actif trouvé pour la clé "${input.workflowKey}".`);
    }

    const nestedRun = await createWorkflowRun({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      workflowDefinitionId: target.id,
      workflowVersionId: target.activeVersionId,
      input: input.input,
      trigger: "WORKFLOW",
      parentRunId: context.runId,
    });

    await context.log("info", `Sous-workflow "${input.workflowKey}" lancé (run "${nestedRun.id}").`);
    const finished = await runWorkflowToCompletion(nestedRun.id);

    if (finished.status === "WAITING") {
      throw new Error(
        "Le sous-workflow est passé en attente (noeud d'attente/délai) — la reprise d'un sous-workflow suspendu n'est pas prise en charge dans cette version (voir ADR 0019)."
      );
    }
    if (finished.status !== "SUCCEEDED") {
      throw new Error(`Le sous-workflow "${input.workflowKey}" a échoué : ${JSON.stringify(finished.error)}`);
    }
    return finished.output;
  },
};
