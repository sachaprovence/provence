import "server-only";
import { ValidationError } from "@/lib/errors";
import { directorRequestSchema, type DirectorRequestInput } from "@/lib/validations/director";
import {
  createPlan,
  getPlan,
  getReadySteps,
  countPendingSteps,
  markPlanRunning,
  markPlanFinished,
  updateStepStatus,
  mergePlanResults,
  type MergedPlanResult,
} from "@/lib/agents/director/planning-engine";
import { decomposeObjective } from "@/lib/agents/director/decomposition";
import { recordConversationTurn, recordDecision, recordRunSummary } from "@/lib/agents/director/memory-helpers";
import { AgentPlanStepStatus } from "@/generated/prisma/enums";
import type { AgentRuntime } from "@/lib/agents/types";

export const DIRECTOR_AGENT_RUNTIME_KEY = "director.orchestrator";

/** Filet de sécurité contre une boucle infinie en cas d'anomalie (DAG toujours valide à la création, voir `planning-engine.ts#createPlan`). */
const MAX_LOOP_ITERATIONS = 50;

const NON_TERMINAL_STEP_STATUSES = new Set<string>([
  AgentPlanStepStatus.PENDING,
  AgentPlanStepStatus.READY,
  AgentPlanStepStatus.DELEGATED,
  AgentPlanStepStatus.RUNNING,
]);

function parseDirectorInput(raw: unknown): DirectorRequestInput {
  const parsed = directorRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      `Entrée invalide pour le Director : ${parsed.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }
  return parsed.data;
}

function summarizeForConversation(merged: MergedPlanResult): string {
  const total = merged.steps.length;
  if (merged.failedCount === 0) {
    return `Plan terminé avec succès : ${merged.succeededCount}/${total} étape(s) réussie(s).`;
  }
  return `Plan terminé avec des échecs : ${merged.succeededCount}/${total} réussie(s), ${merged.failedCount} en échec, ${merged.skippedCount} ignorée(s).`;
}

/**
 * Agent Director (v0.4) — orchestrateur, pas un chatbot : il ne réalise
 * jamais lui-même une tâche métier, il décide quel agent utiliser, dans
 * quel ordre, avec quelles données/outils/permissions, distribue le
 * travail, attend les résultats, les fusionne, et produit une réponse
 * finale. Implémenté intégralement comme un agent du Framework (v0.3) :
 * aucun raccourci, toute délégation passe par les outils
 * `director.*` (`src/lib/agents/tools/director-tools.ts`), qui eux-mêmes
 * ne réutilisent que `execution-engine.ts`/`messaging.ts` déjà existants.
 * Voir ADR 0010 et `docs/02-ARCHITECTURE.md` §11.
 */
export const directorAgentRuntime: AgentRuntime = {
  runtimeKey: DIRECTOR_AGENT_RUNTIME_KEY,

  async execute(context) {
    const input = parseDirectorInput(context.input);
    await context.log("info", `Nouvelle demande reçue : "${input.objective}".`);
    await recordConversationTurn(context.installation, { role: "user", content: input.objective });

    const explicitSteps = input.steps && input.steps.length > 0;
    const stepInputs = explicitSteps ? input.steps! : await decomposeObjective(context.installation, input.objective);

    await recordDecision(context.installation, {
      decision: explicitSteps
        ? `Décomposition fournie explicitement par l'appelant (${stepInputs.length} étape(s)).`
        : `Décomposition heuristique automatique (${stepInputs.length} étape(s), voir ADR 0011).`,
    });

    const plan = await createPlan({
      workspaceId: context.installation.workspaceId,
      installationId: context.installation.id,
      runId: context.run.id,
      goal: input.objective,
      steps: stepInputs,
    });
    await markPlanRunning(plan.id);
    await context.log("info", `Plan généré : ${plan.steps.length} étape(s).`, { planId: plan.id });

    let iterations = 0;
    while (iterations < MAX_LOOP_ITERATIONS) {
      iterations += 1;
      const ready = await getReadySteps(plan.id);

      if (ready.length === 0) {
        const stillPending = await countPendingSteps(plan.id);
        if (stillPending === 0) break;
        continue;
      }

      await context.log("info", `Délégation de ${ready.length} étape(s) prête(s).`, {
        stepIds: ready.map((step) => step.id),
      });

      await Promise.all(
        ready.map(async (step) => {
          try {
            await context.callTool("director.delegate_task", { stepId: step.id });
          } catch (error) {
            // La délégation ne devrait jamais lever (voir delegation-engine.ts),
            // sauf refus de permission sur l'outil lui-même : on capture quand
            // même ici pour ne jamais faire échouer tout le plan à cause d'une
            // seule étape indépendante.
            await updateStepStatus(step.id, {
              status: AgentPlanStepStatus.FAILED,
              finishedAt: new Date(),
              error: { message: error instanceof Error ? error.message : String(error) },
            });
          }
        })
      );
    }

    const finalPlan = await getPlan(plan.id);
    const nonTerminalCount = finalPlan.steps.filter((step) => NON_TERMINAL_STEP_STATUSES.has(step.status)).length;
    if (nonTerminalCount > 0) {
      await context.log("warn", "Incohérence détectée : des étapes restent non terminées après la boucle de planification.", {
        planId: plan.id,
        nonTerminalCount,
      });
    }

    const merged = mergePlanResults(finalPlan);
    const anyFailed = merged.failedCount > 0 || nonTerminalCount > 0;
    await markPlanFinished(plan.id, anyFailed ? "FAILED" : "SUCCEEDED");

    await recordRunSummary(context.installation, {
      runId: context.run.id,
      planId: plan.id,
      goal: input.objective,
      status: anyFailed ? "FAILED" : "SUCCEEDED",
      succeededSteps: merged.succeededCount,
      failedSteps: merged.failedCount,
    });

    const responseText = summarizeForConversation(merged);
    await recordConversationTurn(context.installation, { role: "director", content: responseText });
    await context.log("info", "Plan terminé.", {
      planId: plan.id,
      succeeded: merged.succeededCount,
      failed: merged.failedCount,
      skipped: merged.skippedCount,
    });

    if (anyFailed) {
      return {
        output: { planId: plan.id, status: "FAILED", results: merged, summary: responseText },
        interventionRequested: {
          title: `Le plan pour "${input.objective}" contient des étapes en échec`,
          description: `${merged.failedCount} étape(s) en échec sur ${merged.steps.length} (${merged.skippedCount} ignorée(s)).`,
        },
      };
    }

    return { output: { planId: plan.id, status: "SUCCEEDED", results: merged, summary: responseText } };
  },
};
