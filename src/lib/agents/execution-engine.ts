import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getAgentRuntime } from "./registry";
import { getToolHandler } from "./tool-registry";
import { requireAgentToolPermission } from "./permissions";
import { createInterventionRequest } from "./messaging";
import { registerBuiltInAgentComponents } from "./bootstrap";
import { AgentRunStatus, AgentRunTrigger, AgentInstallationStatus } from "@/generated/prisma/enums";
import type { AgentExecutionContext, AgentLogLevel } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 1;
const RETRY_BACKOFF_MS = 30_000;
const MAX_RUNS_PER_BATCH = 20;

/** Crée une exécution en file d'attente (voir ADR 0008 : file interne sur PostgreSQL, pas de nouvelle brique d'infra). */
export async function createAgentRun(params: {
  installationId: string;
  input?: unknown;
  trigger?: AgentRunTrigger;
  priority?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  scheduledAt?: Date;
  createdById?: string;
  /** Relance délibérée d'un run précédent (voir Agent Director, `delegation-engine.ts#retryStepDelegation`) — lignée visible via `AgentRun.retries`. */
  parentRunId?: string;
}) {
  return prisma.agentRun.create({
    data: {
      installationId: params.installationId,
      input: (params.input ?? null) as never,
      trigger: params.trigger ?? AgentRunTrigger.MANUAL,
      priority: params.priority ?? 0,
      maxAttempts: params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      scheduledAt: params.scheduledAt ?? new Date(),
      createdById: params.createdById,
      parentRunId: params.parentRunId,
    },
  });
}

/** Annule une exécution en attente ou en cours. Une exécution déjà terminée ne peut plus être annulée. */
export async function cancelAgentRun(runId: string) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Exécution introuvable.");
  if (run.status !== AgentRunStatus.QUEUED && run.status !== AgentRunStatus.RUNNING) {
    throw new ValidationError("Seule une exécution en attente ou en cours peut être annulée.");
  }
  return prisma.agentRun.update({
    where: { id: runId },
    data: { status: AgentRunStatus.CANCELLED, cancelledAt: new Date(), finishedAt: new Date() },
  });
}

async function logRun(runId: string, level: AgentLogLevel, message: string, metadata?: Record<string, unknown>) {
  await prisma.agentRunLog.create({ data: { runId, level, message, metadata: (metadata ?? null) as never } });
  logger.child({ module: "agent-run", runId })[level](metadata ?? {}, message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AGENT_RUN_TIMEOUT")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/** Exécute une exécution précise (appelée par `processQueuedAgentRuns`, ou directement pour un déclenchement synchrone). */
export async function executeAgentRun(runId: string): Promise<void> {
  // Next.js peut charger ce module dans un contexte d'exécution (processus/
  // worker) distinct de celui où `src/instrumentation.ts` a appelé
  // `registerBuiltInAgentComponents()` au démarrage — le registre en
  // mémoire (`registry.ts`/`tool-registry.ts`) est alors vide ici même s'il
  // a bien été peuplé ailleurs. Rappel idempotent et sans effet de bord
  // significatif (protégé par un indicateur interne) pour garantir que les
  // runtimes/outils sont bien enregistrés dans CE contexte avant toute
  // résolution — sans cet appel défensif, `getAgentRuntime` peut renvoyer
  // `undefined` en production alors que l'agent est parfaitement valide.
  registerBuiltInAgentComponents();

  const run = await prisma.agentRun.update({
    where: { id: runId },
    data: { status: AgentRunStatus.RUNNING, startedAt: new Date(), attempt: { increment: 1 } },
  });

  const installation = await prisma.agentInstallation.findUniqueOrThrow({
    where: { id: run.installationId },
    include: { definition: true },
  });

  if (installation.status !== AgentInstallationStatus.ACTIVE) {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: AgentRunStatus.FAILED, finishedAt: new Date(), error: { message: "Installation non active." } },
    });
    await logRun(runId, "error", "Exécution refusée : l'agent n'est pas actif.");
    return;
  }

  const runtime = getAgentRuntime(installation.definition.runtimeKey);
  if (!runtime) {
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: AgentRunStatus.FAILED,
        finishedAt: new Date(),
        error: { message: `Runtime "${installation.definition.runtimeKey}" introuvable.` },
      },
    });
    await logRun(runId, "error", `Runtime "${installation.definition.runtimeKey}" introuvable.`);
    return;
  }

  await logRun(runId, "info", "Exécution démarrée.", { attempt: run.attempt });

  const context: AgentExecutionContext = {
    installation,
    run,
    input: run.input,
    callTool: async (toolKey, toolInput) => {
      await requireAgentToolPermission(installation, toolKey);
      const handler = getToolHandler(toolKey);
      if (!handler) throw new NotFoundError(`Outil "${toolKey}" non enregistré.`);
      await logRun(runId, "debug", `Appel de l'outil "${toolKey}".`);
      return handler.handle(toolInput, { installation, run });
    },
    log: (level, message, metadata) => logRun(runId, level, message, metadata),
  };

  try {
    const result = await withTimeout(runtime.execute(context), run.timeoutMs);

    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: AgentRunStatus.SUCCEEDED, finishedAt: new Date(), output: (result.output ?? null) as never },
    });
    await logRun(runId, "info", "Exécution terminée avec succès.");

    if (result.interventionRequested) {
      await createInterventionRequest({
        workspaceId: installation.workspaceId,
        installationId: installation.id,
        runId,
        title: result.interventionRequested.title,
        description: result.interventionRequested.description,
      });
      await logRun(runId, "info", "Demande d'intervention humaine créée.");
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === "AGENT_RUN_TIMEOUT";
    const message = error instanceof Error ? error.message : String(error);
    const canRetry = run.attempt < run.maxAttempts;

    await logRun(runId, "error", isTimeout ? "Délai d'exécution dépassé." : "Échec de l'exécution.", { error: message });

    if (canRetry) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: AgentRunStatus.QUEUED,
          scheduledAt: new Date(Date.now() + RETRY_BACKOFF_MS),
          error: { message },
        },
      });
      await logRun(runId, "info", `Nouvelle tentative planifiée (${run.attempt}/${run.maxAttempts}).`);
      return;
    }

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: isTimeout ? AgentRunStatus.TIMED_OUT : AgentRunStatus.FAILED,
        finishedAt: new Date(),
        error: { message },
      },
    });
  }
}

/**
 * Point d'entrée du traitement planifié des exécutions en file d'attente
 * (appelé par `POST /api/cron/process-agent-runs`) — même pattern que
 * `processDueSequences` (`src/lib/sequence-engine.ts`).
 */
export async function processQueuedAgentRuns(now: Date = new Date()) {
  const due = await prisma.agentRun.findMany({
    where: { status: AgentRunStatus.QUEUED, scheduledAt: { lte: now } },
    orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
    select: { id: true },
    take: MAX_RUNS_PER_BATCH,
  });

  const results: { runId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) {
    try {
      await executeAgentRun(id);
      results.push({ runId: id, ok: true });
    } catch (error) {
      results.push({ runId: id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
