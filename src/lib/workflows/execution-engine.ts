import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { registerBuiltInWorkflowComponents } from "./bootstrap";
import { getWorkflowAction, type WorkflowActionContext, type WorkflowLogLevel } from "./actions/registry";
import { evaluateRule, resolveActionInput, resolveExpr } from "./expressions/evaluator";
import { createEmptyVariableContext, type VariableContext } from "./expressions/variable-context";
import { resolveActiveInstallation } from "@/lib/agents/installation-service";
import { createAgentRun } from "@/lib/agents/execution-engine";
import { AgentRunTrigger as FrameworkAgentRunTrigger, WorkflowRunStatus, WorkflowStepStatus } from "@/generated/prisma/enums";
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  ActionNodeData,
  ConditionNodeData,
  LoopNodeData,
  WaitNodeData,
  SubworkflowNodeData,
  WorkflowErrorPolicy,
} from "./graph-types";
import type { WorkflowRun, WorkflowRunStatus as WorkflowRunStatusType } from "@/generated/prisma/client";

const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const DEFAULT_STEP_MAX_ATTEMPTS = 1;
const DEFAULT_STEP_RETRY_BACKOFF_MS = 15_000;
const MAX_RUNS_PER_BATCH = 20;
const MAX_TICKS_PER_CALL = 200;
/** Filet de sécurité contre une boucle infinie — même principe que `agents/execution-engine.ts#MAX_DRIVE_ITERATIONS`. */
const MAX_DRIVE_ITERATIONS = 25;
const MAX_LOOP_ITERATIONS_DEFAULT = 1000;

const TERMINAL_RUN_STATUSES = new Set<WorkflowRunStatusType>(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);
const TERMINAL_STEP_STATUSES = new Set(["SUCCEEDED", "FAILED", "SKIPPED", "CANCELLED", "COMPENSATED"]);

export async function createWorkflowRun(params: {
  organizationId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowVersionId: string;
  input?: unknown;
  trigger?: (typeof FrameworkAgentRunTrigger)[keyof typeof FrameworkAgentRunTrigger] | string;
  triggerKey?: string;
  priority?: number;
  maxAttempts?: number;
  parentRunId?: string;
  createdById?: string;
  scheduledAt?: Date;
}) {
  return prisma.workflowRun.create({
    data: {
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      workflowDefinitionId: params.workflowDefinitionId,
      workflowVersionId: params.workflowVersionId,
      input: (params.input ?? null) as never,
      trigger: (params.trigger as never) ?? "MANUAL",
      triggerKey: params.triggerKey,
      priority: params.priority ?? 0,
      maxAttempts: params.maxAttempts ?? DEFAULT_STEP_MAX_ATTEMPTS,
      parentRunId: params.parentRunId,
      createdById: params.createdById,
      scheduledAt: params.scheduledAt ?? new Date(),
    },
  });
}

export async function cancelWorkflowRun(runId: string) {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Exécution de workflow introuvable.");
  if (run.status !== "QUEUED" && run.status !== "RUNNING" && run.status !== "WAITING") {
    throw new ValidationError("Seule une exécution en attente ou en cours peut être annulée.");
  }
  await prisma.workflowRunStep.updateMany({
    where: { runId, status: { in: ["PENDING", "RUNNING", "WAITING"] } },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  return prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
  });
}

async function logRun(runId: string, nodeId: string | null, level: WorkflowLogLevel, message: string, metadata?: Record<string, unknown>) {
  await prisma.workflowRunLog.create({ data: { runId, nodeId, level, message, metadata: (metadata ?? null) as never } });
  logger.child({ module: "workflow-run", runId, nodeId })[level](metadata ?? {}, message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WORKFLOW_STEP_TIMEOUT")), timeoutMs);
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

function collectSubordinateNodeIds(nodes: WorkflowNode[]): Set<string> {
  const subordinate = new Set<string>();
  for (const node of nodes) {
    if (node.type === "loop") {
      for (const id of (node.data as LoopNodeData).bodyNodeIds) subordinate.add(id);
    }
  }
  return subordinate;
}

function incomingEdgesFor(nodeId: string, edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter((edge) => edge.target === nodeId);
}

type StepState = { status: string; output: unknown; error: { message: string; policy?: string } | null; attempt: number };

/**
 * Un noeud "satisfait" une arête sortante si : il a réussi (et, pour une
 * arête étiquetée `branch`, que la branche corresponde à sa sortie — cas
 * des noeuds `condition` et des arêtes d'erreur `branch: "error"`), ou
 * s'il a été ignoré suite à une erreur tolérée (`onError: "ignore"`, arête
 * non étiquetée uniquement). Un noeud SKIPPED par cascade (branche non
 * empruntée) ne satisfait jamais d'arête — c'est ce qui propage l'arrêt
 * d'une branche non retenue.
 */
function edgeIsSatisfied(edge: WorkflowEdge, sourceState: StepState): boolean {
  if (sourceState.status === "SUCCEEDED") {
    if (!edge.branch) return true;
    const output = sourceState.output as { branch?: string } | null;
    return output?.branch === edge.branch;
  }
  if (sourceState.status === "SKIPPED" && sourceState.error?.policy === "ignore") {
    return !edge.branch;
  }
  if (sourceState.status === "FAILED" && sourceState.error?.policy === "alternative_branch") {
    return edge.branch === "error";
  }
  return false;
}

type RunContextRef = { organizationId: string; workspaceId: string };

async function buildInitialVariableContext(run: Pick<WorkflowRun, "organizationId" | "workspaceId" | "input">) {
  const ctx = createEmptyVariableContext({ organizationId: run.organizationId, workspaceId: run.workspaceId });
  ctx.context = (run.input as Record<string, unknown>) ?? {};
  ctx.form = (run.input as Record<string, unknown>) ?? {};
  return ctx;
}

/** Résout la valeur `collectionExpr` d'un noeud `loop` en tableau — lève une erreur claire si ce n'est pas un tableau. */
function resolveLoopCollection(data: LoopNodeData, ctx: VariableContext): unknown[] {
  const value = resolveExpr(data.collectionExpr, ctx);
  if (!Array.isArray(value)) {
    throw new ValidationError(`L'expression de collection du noeud de boucle ne résout pas vers un tableau (valeur : ${JSON.stringify(value)}).`);
  }
  return value;
}

async function executeActionNode(
  node: WorkflowNode,
  data: ActionNodeData,
  ctx: VariableContext,
  run: RunContextRef & { id: string }
): Promise<unknown> {
  const handler = getWorkflowAction(data.actionKey);
  if (!handler) throw new NotFoundError(`Action "${data.actionKey}" non enregistrée.`);

  const resolvedInput = resolveActionInput(data.input ?? {}, ctx);
  const actionContext: WorkflowActionContext = {
    organizationId: run.organizationId,
    workspaceId: run.workspaceId,
    runId: run.id,
    nodeId: node.id,
    setVariable: (name, value) => {
      Object.assign(ctx.workflow, { [name]: value });
    },
    log: (level, message, metadata) => logRun(run.id, node.id, level, message, metadata),
  };

  return withTimeout(handler.execute(resolvedInput, actionContext), data.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS);
}

async function executeLoopNode(
  node: WorkflowNode,
  graph: WorkflowGraph,
  ctx: VariableContext,
  run: RunContextRef & { id: string }
): Promise<unknown> {
  const data = node.data as LoopNodeData;
  const items = resolveLoopCollection(data, ctx);
  const maxIterations = data.maxIterations ?? MAX_LOOP_ITERATIONS_DEFAULT;
  if (items.length > maxIterations) {
    throw new ValidationError(`La collection de la boucle dépasse le nombre maximal d'itérations autorisé (${maxIterations}).`);
  }

  const bodyNodes = graph.nodes.filter((n) => data.bodyNodeIds.includes(n.id));
  const bodyEdges = graph.edges.filter((e) => data.bodyNodeIds.includes(e.source) && data.bodyNodeIds.includes(e.target));

  const iterations: { item: unknown; results: Record<string, unknown>; error?: string }[] = [];

  for (const item of items) {
    const iterationCtx: VariableContext = { ...ctx, workflow: { ...ctx.workflow, [data.itemVar]: item } };
    const results: Record<string, unknown> = {};
    const stepStates = new Map<string, StepState>();

    try {
      let progressed = true;
      let ticks = 0;
      while (progressed && ticks < bodyNodes.length + 2) {
        progressed = false;
        ticks += 1;
        for (const bodyNode of bodyNodes) {
          if (stepStates.has(bodyNode.id)) continue;
          const incoming = incomingEdgesFor(bodyNode.id, bodyEdges);
          if (incoming.length > 0 && !incoming.every((edge) => stepStates.has(edge.source))) continue;
          const satisfied = incoming.length === 0 || incoming.some((edge) => edgeIsSatisfied(edge, stepStates.get(edge.source)!));
          if (incoming.length > 0 && !satisfied) {
            stepStates.set(bodyNode.id, { status: "SKIPPED", output: null, error: null, attempt: 0 });
            progressed = true;
            continue;
          }
          const output = await executeGraphNode(bodyNode, graph, iterationCtx, run);
          results[bodyNode.id] = output;
          stepStates.set(bodyNode.id, { status: "SUCCEEDED", output, error: null, attempt: 0 });
          progressed = true;
        }
      }
      iterations.push({ item, results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      iterations.push({ item, results, error: message });
      await logRun(run.id, node.id, "error", `Itération de boucle échouée : ${message}`, { item });
      throw error;
    }
  }

  return { iterationCount: iterations.length, iterations };
}

/**
 * Le noeud dédié "subworkflow" (bloc de palette) délègue entièrement à
 * l'action de plugin `workflow.run_subworkflow` (voir
 * `actions/builtin/subworkflow-action.ts`) — un seul et même code, jamais
 * deux implémentations : le bloc n'est qu'un raccourci graphique vers la
 * même action, utilisable aussi depuis un noeud `action` générique.
 */
async function executeSubworkflowNode(
  node: WorkflowNode,
  data: SubworkflowNodeData,
  ctx: VariableContext,
  run: RunContextRef & { id: string }
): Promise<unknown> {
  const handler = getWorkflowAction("workflow.run_subworkflow");
  if (!handler) throw new NotFoundError('Action "workflow.run_subworkflow" non enregistrée.');
  const resolvedInput = resolveActionInput(data, ctx);
  return handler.execute(resolvedInput, {
    organizationId: run.organizationId,
    workspaceId: run.workspaceId,
    runId: run.id,
    nodeId: node.id,
    setVariable: () => undefined,
    log: (level, message, metadata) => logRun(run.id, node.id, level, message, metadata),
  });
}

/** Exécute un noeud unique (utilisé par le corps d'une boucle comme par le graphe racine) et renvoie sa sortie brute. */
async function executeGraphNode(node: WorkflowNode, graph: WorkflowGraph, ctx: VariableContext, run: RunContextRef & { id: string }): Promise<unknown> {
  switch (node.type) {
    case "trigger":
      return ctx.context;
    case "condition": {
      const result = evaluateRule((node.data as ConditionNodeData).rule, ctx);
      return { result, branch: result ? "true" : "false" };
    }
    case "action":
      return executeActionNode(node, node.data as ActionNodeData, ctx, run);
    case "loop":
      return executeLoopNode(node, graph, ctx, run);
    case "subworkflow":
      return executeSubworkflowNode(node, node.data as SubworkflowNodeData, ctx, run);
    case "end":
      // Copie superficielle : ne jamais renvoyer `ctx.results` directement, sous peine
      // d'auto-référence une fois affecté à `ctx.results[node.id]` par l'appelant.
      return { ...ctx.results };
    case "wait":
      throw new Error("WORKFLOW_WAIT_NODE"); // géré spécifiquement par l'appelant (executeWorkflowRun), jamais depuis une boucle imbriquée.
    default:
      throw new Error(`Type de noeud non géré : "${node.type}".`);
  }
}

function defaultErrorPolicy(): WorkflowErrorPolicy {
  return { kind: "stop" };
}

/**
 * Exécute (ou reprend) un run jusqu'à ce qu'il devienne terminal, en
 * attente (`WAITING`), ou remis en file pour une nouvelle tentative
 * (`QUEUED`). Ré-entrant : recharge systématiquement l'état persisté de
 * chaque `WorkflowRunStep` plutôt que de supposer un état en mémoire —
 * une reprise après redémarrage du serveur ne rejoue jamais une étape déjà
 * `SUCCEEDED`/`SKIPPED`/`CANCELLED`.
 */
export async function executeWorkflowRun(runId: string): Promise<void> {
  registerBuiltInWorkflowComponents();

  const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
  const version = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: run.workflowVersionId } });
  const graph = version.graph as unknown as WorkflowGraph;

  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: run.startedAt ?? new Date(), attempt: { increment: 1 } },
  });
  await logRun(runId, null, "info", "Exécution démarrée (ou reprise).", { attempt: run.attempt + 1 });

  const subordinateIds = collectSubordinateNodeIds(graph.nodes);
  const topNodes = graph.nodes.filter((n) => !subordinateIds.has(n.id));

  await prisma.workflowRunStep.createMany({
    data: topNodes.map((n) => ({ runId, nodeId: n.id, nodeType: n.type, actionKey: n.type === "action" ? (n.data as ActionNodeData).actionKey : null })),
    skipDuplicates: true,
  });

  const persistedSteps = await prisma.workflowRunStep.findMany({ where: { runId } });
  const stepStates = new Map<string, StepState>(
    persistedSteps.map((s) => [s.nodeId, { status: s.status, output: s.output, error: s.error as StepState["error"], attempt: s.attempt }])
  );

  const ctx = await buildInitialVariableContext(run);
  // Réhydrate les résultats déjà obtenus (reprise après suspension/retry).
  for (const [nodeId, state] of stepStates) {
    if (state.status === "SUCCEEDED") ctx.results[nodeId] = state.output;
  }

  // Reprise d'un noeud `wait` : le délai est présumé écoulé (sinon `processDueWorkflowWaits` n'aurait pas rappelé cette fonction).
  for (const node of topNodes) {
    if (node.type === "wait" && stepStates.get(node.id)?.status === "WAITING") {
      await prisma.workflowRunStep.update({
        where: { runId_nodeId: { runId, nodeId: node.id } },
        data: { status: "SUCCEEDED", finishedAt: new Date(), output: { resumed: true } },
      });
      stepStates.set(node.id, { status: "SUCCEEDED", output: { resumed: true }, error: null, attempt: 0 });
      await logRun(runId, node.id, "info", "Reprise après attente.");
    }
  }

  let halted: { status: "FAILED" | "CANCELLED"; error: unknown } | null = null;
  let suspended: { resumeAt: Date } | null = null;
  let retryRequested: { backoffMs: number } | null = null;

  for (let tick = 0; tick < MAX_TICKS_PER_CALL && !halted && !suspended && !retryRequested; tick += 1) {
    const ready: WorkflowNode[] = [];
    for (const node of topNodes) {
      const state = stepStates.get(node.id)!;
      if (state.status !== "PENDING") continue;
      const incoming = incomingEdgesFor(node.id, graph.edges).filter((e) => !subordinateIds.has(e.source));
      if (incoming.length === 0) {
        ready.push(node);
        continue;
      }
      const allTerminal = incoming.every((edge) => TERMINAL_STEP_STATUSES.has(stepStates.get(edge.source)!.status));
      if (!allTerminal) continue;
      const satisfied = incoming.some((edge) => edgeIsSatisfied(edge, stepStates.get(edge.source)!));
      if (satisfied) {
        ready.push(node);
      } else {
        stepStates.set(node.id, { status: "SKIPPED", output: null, error: null, attempt: state.attempt });
        await prisma.workflowRunStep.update({
          where: { runId_nodeId: { runId, nodeId: node.id } },
          data: { status: "SKIPPED", finishedAt: new Date() },
        });
      }
    }

    if (ready.length === 0) break;

    await prisma.workflowRunStep.updateMany({
      where: { runId, nodeId: { in: ready.map((n) => n.id) } },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const settled = await Promise.allSettled(
      ready.map(async (node) => {
        if (node.type === "wait") {
          const data = node.data as WaitNodeData;
          const resumeAt = data.delayMs ? new Date(Date.now() + data.delayMs) : data.until ? new Date() : new Date();
          return { node, kind: "wait" as const, resumeAt };
        }
        const startedAt = Date.now();
        const output = await executeGraphNode(node, graph, ctx, { id: runId, organizationId: run.organizationId, workspaceId: run.workspaceId });
        return { node, kind: "done" as const, output, durationMs: Date.now() - startedAt };
      })
    );

    for (let i = 0; i < settled.length; i += 1) {
      const node = ready[i];
      const outcome = settled[i];

      if (outcome.status === "fulfilled" && outcome.value.kind === "wait") {
        stepStates.set(node.id, { status: "WAITING", output: null, error: null, attempt: 0 });
        await prisma.workflowRunStep.update({ where: { runId_nodeId: { runId, nodeId: node.id } }, data: { status: "WAITING" } });
        await logRun(runId, node.id, "info", "Passage en attente.");
        suspended = { resumeAt: outcome.value.resumeAt };
        continue;
      }

      if (outcome.status === "fulfilled") {
        const output = outcome.value.output;
        stepStates.set(node.id, { status: "SUCCEEDED", output, error: null, attempt: stepStates.get(node.id)!.attempt });
        ctx.results[node.id] = output;
        if (node.type === "action" && (node.data as ActionNodeData).actionKey === "http.call_api") {
          ctx.api[node.id] = output;
        }
        if (node.type === "action" && (node.data as ActionNodeData).actionKey === "agent.call") {
          ctx.agents[node.id] = output;
        }
        await prisma.workflowRunStep.update({
          where: { runId_nodeId: { runId, nodeId: node.id } },
          data: { status: "SUCCEEDED", finishedAt: new Date(), output: output as never, durationMs: outcome.value.durationMs },
        });
        await logRun(runId, node.id, "info", `Noeud "${node.id}" (${node.type}) terminé avec succès.`);
        continue;
      }

      // Échec du noeud.
      const error = outcome.reason;
      const isTimeout = error instanceof Error && error.message === "WORKFLOW_STEP_TIMEOUT";
      const message = error instanceof Error ? error.message : String(error);
      const policy: WorkflowErrorPolicy = node.type === "action" ? (node.data as ActionNodeData).onError ?? defaultErrorPolicy() : defaultErrorPolicy();
      const previousAttempt = stepStates.get(node.id)!.attempt;

      await logRun(runId, node.id, "error", `Noeud "${node.id}" en échec (${isTimeout ? "délai dépassé" : "erreur"}).`, { error: message, policy: policy.kind });

      if (policy.kind === "retry" && previousAttempt < policy.maxAttempts) {
        stepStates.set(node.id, { status: "PENDING", output: null, error: { message }, attempt: previousAttempt + 1 });
        await prisma.workflowRunStep.update({
          where: { runId_nodeId: { runId, nodeId: node.id } },
          data: { status: "PENDING", attempt: previousAttempt + 1, error: { message } as never },
        });
        retryRequested = { backoffMs: policy.backoffMs ?? DEFAULT_STEP_RETRY_BACKOFF_MS };
        continue;
      }

      if (policy.kind === "ignore") {
        stepStates.set(node.id, { status: "SKIPPED", output: null, error: { message, policy: "ignore" }, attempt: previousAttempt });
        await prisma.workflowRunStep.update({
          where: { runId_nodeId: { runId, nodeId: node.id } },
          data: { status: "SKIPPED", finishedAt: new Date(), error: { message, policy: "ignore" } as never },
        });
        continue;
      }

      // stop / alternative_branch / notify / escalate_director : le noeud lui-même est marqué FAILED.
      stepStates.set(node.id, { status: "FAILED", output: null, error: { message, policy: policy.kind }, attempt: previousAttempt });
      await prisma.workflowRunStep.update({
        where: { runId_nodeId: { runId, nodeId: node.id } },
        data: { status: "FAILED", finishedAt: new Date(), error: { message, policy: policy.kind } as never },
      });

      if (policy.kind === "alternative_branch") {
        const hasErrorEdge = graph.edges.some((e) => e.source === node.id && e.branch === "error");
        if (hasErrorEdge) continue; // l'arête "error" sera empruntée au prochain tick, le run continue.
      }

      if (policy.kind === "notify") {
        await prisma.notification.create({
          data: {
            organizationId: run.organizationId,
            type: "workflow_error",
            title: `Échec du workflow (noeud "${node.id}")`,
            body: message,
            link: `/workflows/runs/${runId}`,
          },
        });
      }

      if (policy.kind === "escalate_director") {
        const director = await resolveActiveInstallation({ workspaceId: run.workspaceId, category: "director" });
        if (director) {
          const escalationRun = await createAgentRun({
            installationId: director.id,
            trigger: FrameworkAgentRunTrigger.EVENT,
            input: { objective: `Résoudre l'échec du workflow (run "${runId}", noeud "${node.id}") : ${message}`, workflowRunId: runId, nodeId: node.id },
          });
          const { executeAgentRun } = await import("@/lib/agents/execution-engine");
          await executeAgentRun(escalationRun.id).catch(() => undefined);
          await prisma.workflowRun.update({ where: { id: runId }, data: { escalatedToDirector: true } });
        }
      }

      halted = { status: "FAILED", error: { message, nodeId: node.id, policy: policy.kind } };
    }
  }

  if (halted) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: halted.status, finishedAt: new Date(), error: halted.error as never },
    });
    await runCompensations(runId, graph, stepStates);
    return;
  }

  if (retryRequested) {
    const canRetry = run.attempt < run.maxAttempts || true; // le retry est piloté au niveau du noeud, pas du run — voir onError "retry".
    if (canRetry) {
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: "QUEUED", scheduledAt: new Date(Date.now() + retryRequested.backoffMs) },
      });
      await logRun(runId, null, "info", "Nouvelle tentative planifiée pour une étape en échec.");
      return;
    }
  }

  if (suspended) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "WAITING", resumeAt: suspended.resumeAt },
    });
    await logRun(runId, null, "info", "Exécution suspendue (noeud d'attente).", { resumeAt: suspended.resumeAt });
    return;
  }

  const stillPending = topNodes.some((n) => stepStates.get(n.id)!.status === "PENDING");
  if (stillPending) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "FAILED", finishedAt: new Date(), error: { message: "Le graphe n'a pas pu progresser jusqu'à un état terminal (dépendances bloquées)." } as never },
    });
    return;
  }

  const endNode = topNodes.find((n) => n.type === "end");
  const output = endNode
    ? (stepStates.get(endNode.id)?.output ?? null)
    : Object.fromEntries(Array.from(stepStates.entries()).map(([id, s]) => [id, s.output]));
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), output: output as never, context: ctx as never },
  });
  await logRun(runId, null, "info", "Exécution terminée avec succès.");
}

/**
 * Rollback logique (pas de transaction SQL) : rejoue, dans l'ordre inverse,
 * l'action de compensation déclarée (`compensateActionKey`) de chaque
 * étape `SUCCEEDED` — voir ADR 0019 pour la justification du caractère
 * "logique" (pas atomique) de cette compensation.
 */
async function runCompensations(runId: string, graph: WorkflowGraph, stepStates: Map<string, StepState>) {
  const compensable = graph.nodes
    .filter((n): n is WorkflowNode & { data: ActionNodeData } => n.type === "action" && Boolean((n.data as ActionNodeData).compensateActionKey))
    .filter((n) => stepStates.get(n.id)?.status === "SUCCEEDED")
    .reverse();

  for (const node of compensable) {
    const compensateKey = node.data.compensateActionKey!;
    const handler = getWorkflowAction(compensateKey);
    if (!handler) {
      await logRun(runId, node.id, "warn", `Action de compensation "${compensateKey}" non enregistrée — compensation ignorée.`);
      continue;
    }
    try {
      const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
      await handler.execute(stepStates.get(node.id)!.output, {
        organizationId: run.organizationId,
        workspaceId: run.workspaceId,
        runId,
        nodeId: node.id,
        setVariable: () => undefined,
        log: (level, message, metadata) => logRun(runId, node.id, level, message, metadata),
      });
      await prisma.workflowRunStep.update({ where: { runId_nodeId: { runId, nodeId: node.id } }, data: { status: "COMPENSATED" } });
      await logRun(runId, node.id, "info", `Compensation "${compensateKey}" exécutée.`);
    } catch (error) {
      await logRun(runId, node.id, "error", `Échec de la compensation "${compensateKey}".`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Fait avancer un run jusqu'à un statut terminal — même principe que `agents/execution-engine.ts#runAgentToCompletion`, réservé aux appels internes (ex. sous-workflow) qui ont besoin d'attendre le résultat. */
export async function runWorkflowToCompletion(runId: string): Promise<WorkflowRun> {
  for (let i = 0; i < MAX_DRIVE_ITERATIONS; i += 1) {
    await executeWorkflowRun(runId);
    const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL_RUN_STATUSES.has(run.status) || run.status === "WAITING") return run;
  }
  return prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
}

/** Traitement planifié des runs en file d'attente (appelé par `POST /api/cron/process-workflow-runs`). */
export async function processQueuedWorkflowRuns(now: Date = new Date()) {
  const due = await prisma.workflowRun.findMany({
    where: { status: WorkflowRunStatus.QUEUED, scheduledAt: { lte: now } },
    orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
    select: { id: true },
    take: MAX_RUNS_PER_BATCH,
  });

  const results: { runId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) {
    try {
      await executeWorkflowRun(id);
      results.push({ runId: id, ok: true });
    } catch (error) {
      results.push({ runId: id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/** Reprend les runs suspendus (`WAITING`) dont le délai est écoulé. */
export async function processDueWorkflowWaits(now: Date = new Date()) {
  const due = await prisma.workflowRun.findMany({
    where: { status: WorkflowRunStatus.WAITING, resumeAt: { lte: now } },
    select: { id: true },
    take: MAX_RUNS_PER_BATCH,
  });

  const results: { runId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) {
    try {
      await executeWorkflowRun(id);
      results.push({ runId: id, ok: true });
    } catch (error) {
      results.push({ runId: id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export { WorkflowStepStatus };
