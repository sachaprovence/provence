import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import type { WorkspaceActor } from "@/lib/workspace-context";
import { resolveActiveInstallation } from "@/lib/agents/installation-service";
import { createAgentRun } from "@/lib/agents/execution-engine";
import { AgentRunTrigger } from "@/generated/prisma/enums";
import { registerBuiltInAutomationActions } from "../actions";
import { getAutomationJobHandler, type AutomationJobContext, type AutomationJobLogLevel } from "../actions/registry";
import { getActiveQueueProvider } from "../queue";
import { getActiveLockManager } from "../lock";
import { admitByConcurrency, remainingGlobalCapacity, getWorkerPoolSize } from "../concurrency";
import { decideRetry, DEFAULT_RETRY_POLICY, isCircuitOpen, recordCircuitFailure, recordCircuitSuccess, type RetryPolicy } from "../retry";
import { sendToDeadLetter } from "../dlq";
import { createAutomationRun, resolveAutomationForActor, resolveAutomationRunForActor } from "../registry/automation-service";
import { evaluateRule, resolveExpr, resolveActionInput, createEmptyVariableContext, type VariableContext } from "../conditions";
import {
  loadRunState,
  collectSubordinateNodeIds,
  isSubgraphSettled,
  subgraphHasFailure,
  defaultErrorPolicy,
  nodeStatesFromRecord,
  nodeStatesToRecord,
  TERMINAL_NODE_STATUSES,
  type NodeState,
} from "./run-state";
import { tickGraph, type DispatchResult, type PollResult } from "./tick-graph";
import type {
  AutomationGraph,
  AutomationNode,
  ActionNodeData,
  ConditionNodeData,
  SwitchNodeData,
  LoopNodeData,
  MapNodeData,
  WaitNodeData,
  JoinNodeData,
  SubautomationNodeData,
  Expr,
} from "../graph-types";
import type { AutomationJob } from "@/generated/prisma/client";

/**
 * Job Executor (Automation Engine, v0.8) : le composant qui relie tous les
 * autres — Queue Manager, Concurrency Manager, Lock Manager, Retry Engine,
 * Circuit Breaker, Dead Letter Queue, registre de jobs/actions — jamais
 * modifiés pour l'intégrer, uniquement composés ici. Deux responsabilités
 * bien séparées (voir ADR 0031/0036) :
 *
 * - `advanceAutomationRun` (ce fichier + `tick-graph.ts`/`run-state.ts`) :
 *   fait progresser le GRAPHE d'un `AutomationRun` — noeuds de contrôle de
 *   flux exécutés en ligne (comme `executeGraphNode` pour le Workflow
 *   Engine), noeuds `action` matérialisés en `AutomationJob` durable puis
 *   attendus de façon non bloquante (ré-entrant, jamais de blocage sur un
 *   job en vol : l'appel revient, une prochaine avancée reprendra).
 * - `processAutomationJobs` : le worker qui réclame réellement les
 *   `AutomationJob` prêts et les exécute — tentative, retry, disjoncteur,
 *   DLQ — puis relance `advanceAutomationRun` sur le run parent une fois le
 *   job réglé, pour que le graphe progresse sans attendre un prochain tick
 *   de cron.
 */

const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const MAX_LOOP_ITERATIONS_DEFAULT = 1000;
const MAX_RUNS_PER_BATCH = 20;

const TERMINAL_RUN_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);
const TERMINAL_JOB_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "DEAD_LETTERED"]);

type RunRef = { id: string; organizationId: string; workspaceId: string; automationId: string; createdById: string | null };

async function logRun(runId: string, nodeId: string | null, level: AutomationJobLogLevel, message: string, metadata?: Record<string, unknown>) {
  await prisma.automationRunLog.create({ data: { runId, nodeId, level, message, metadata: (metadata ?? null) as never } });
  logger.child({ module: "automation-run", runId, nodeId })[level](metadata ?? {}, message);
}

async function logJob(jobId: string, level: AutomationJobLogLevel, message: string, metadata?: Record<string, unknown>) {
  await prisma.automationJobLog.create({ data: { jobId, level, message, metadata: (metadata ?? null) as never } });
  logger.child({ module: "automation-job", jobId })[level](metadata ?? {}, message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AUTOMATION_JOB_TIMEOUT")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function resolveCollection(collectionExpr: Expr, ctx: VariableContext): unknown[] {
  const value = resolveExpr(collectionExpr, ctx);
  if (!Array.isArray(value)) {
    throw new ValidationError(`L'expression de collection ne résout pas vers un tableau (valeur : ${JSON.stringify(value)}).`);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Noeud "action" — matérialisation en AutomationJob durable            */
/* ------------------------------------------------------------------ */

async function dispatchActionNode(data: ActionNodeData, ctx: VariableContext, run: RunRef, jobNodeId: string): Promise<DispatchResult> {
  if (!data.jobType) throw new ValidationError(`Le noeud action "${jobNodeId}" n'a pas de type de job.`);
  const resolvedInput = resolveActionInput(data.input ?? {}, ctx) as Record<string, unknown>;

  const job = await prisma.automationJob.create({
    data: {
      organizationId: run.organizationId,
      workspaceId: run.workspaceId,
      automationId: run.automationId,
      automationRunId: run.id,
      nodeId: jobNodeId,
      jobType: data.jobType,
      input: resolvedInput as never,
      priority: data.priority ?? 0,
      retryPolicy: (data.retryPolicy ?? null) as never,
      lockKey: data.lockKey,
      concurrencyKey: data.concurrencyKey,
      concurrencyLimit: data.concurrencyLimit,
      rateLimitKey: data.rateLimitKey,
      timeoutMs: data.timeoutMs,
      maxAttempts: data.retryPolicy?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts ?? 1,
      createdById: run.createdById ?? undefined,
    },
  });
  return { kind: "in-flight", output: { jobId: job.id } };
}

/** Sonde le job durable associé au noeud — n'agit qu'une fois le job réellement terminal (voir `TERMINAL_JOB_STATUSES`), jamais avant. */
async function pollActionNode(node: AutomationNode, data: ActionNodeData, nodeStates: Map<string, NodeState>, run: RunRef): Promise<PollResult> {
  const state = nodeStates.get(node.id)!;
  const jobId = (state.output as { jobId?: string } | null)?.jobId;
  if (!jobId) return { kind: "pending" };

  const job = await prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "SUCCEEDED") return { kind: "settled", status: "SUCCEEDED", output: job.output };
  if (!TERMINAL_JOB_STATUSES.has(job.status)) return { kind: "pending" };

  const policy = data.onError ?? defaultErrorPolicy();
  const errorMessage = (job.error as { message?: string } | null)?.message ?? `Job "${job.id}" en échec (${job.status}).`;

  if (policy.kind === "ignore") {
    return { kind: "settled", status: "SKIPPED", error: { message: errorMessage, policy: "ignore" } };
  }
  if (policy.kind === "notify") {
    await prisma.notification.create({
      data: {
        organizationId: run.organizationId,
        type: "automation_error",
        title: `Échec de l'automatisation (noeud "${node.id}")`,
        body: errorMessage,
        link: `/automations/runs/${run.id}`,
      },
    });
  }
  if (policy.kind === "escalate_director") {
    const director = await resolveActiveInstallation({ workspaceId: run.workspaceId, category: "director" });
    if (director) {
      const escalationRun = await createAgentRun({
        installationId: director.id,
        trigger: AgentRunTrigger.EVENT,
        input: { objective: `Résoudre l'échec de l'automatisation (run "${run.id}", noeud "${node.id}") : ${errorMessage}`, automationRunId: run.id, nodeId: node.id },
      });
      const { executeAgentRun } = await import("@/lib/agents/execution-engine");
      await executeAgentRun(escalationRun.id).catch(() => undefined);
    }
  }
  return { kind: "settled", status: "FAILED", error: { message: errorMessage, policy: policy.kind } };
}

/* ------------------------------------------------------------------ */
/* Noeuds de contrôle de flux imbricables (corps de loop/map)           */
/* ------------------------------------------------------------------ */

async function dispatchBodyNode(node: AutomationNode, ctx: VariableContext, run: RunRef, jobNodeId: string): Promise<DispatchResult> {
  switch (node.type) {
    case "condition": {
      const result = evaluateRule((node.data as ConditionNodeData).rule, ctx);
      return { kind: "settled", status: "SUCCEEDED", output: { result, branch: result ? "true" : "false" } };
    }
    case "switch": {
      const data = node.data as SwitchNodeData;
      const matched = data.cases.find((c) => evaluateRule(c.rule, ctx));
      return { kind: "settled", status: "SUCCEEDED", output: { branch: matched?.branch ?? "default" } };
    }
    case "end":
      return { kind: "settled", status: "SUCCEEDED", output: { ...ctx.results } };
    case "action":
      return dispatchActionNode(node.data as ActionNodeData, ctx, run, jobNodeId);
    case "wait":
      throw new ValidationError(`Le noeud "wait" n'est pas pris en charge dans le corps d'une boucle/"map" (noeud "${node.id}").`);
    default:
      throw new ValidationError(
        `Le noeud "${node.type}" n'est pas pris en charge imbriqué dans une boucle/"map" (noeud "${node.id}") — un seul niveau d'imbrication est pris en charge dans cette phase.`
      );
  }
}

async function pollBodyNode(node: AutomationNode, nodeStates: Map<string, NodeState>, run: RunRef): Promise<PollResult> {
  if (node.type === "action") return pollActionNode(node, node.data as ActionNodeData, nodeStates, run);
  return { kind: "pending" };
}

/* ------------------------------------------------------------------ */
/* Noeud "loop" — itération SÉQUENTIELLE du corps                       */
/* ------------------------------------------------------------------ */

async function dispatchLoopNode(node: AutomationNode, ctx: VariableContext, runState: ReturnType<typeof loadRunState>): Promise<DispatchResult> {
  const data = node.data as LoopNodeData;
  const items = resolveCollection(data.collectionExpr, ctx);
  const maxIterations = data.maxIterations ?? MAX_LOOP_ITERATIONS_DEFAULT;
  if (items.length > maxIterations) {
    throw new ValidationError(`La collection de la boucle "${node.id}" dépasse le nombre maximal d'itérations autorisé (${maxIterations}).`);
  }
  runState.loopStates[node.id] = { items, index: 0, results: [], sub: {} };
  return { kind: "in-flight" };
}

async function pollLoopNode(
  node: AutomationNode,
  graph: AutomationGraph,
  ctx: VariableContext,
  run: RunRef,
  runState: ReturnType<typeof loadRunState>
): Promise<PollResult> {
  const data = node.data as LoopNodeData;
  const loopState = runState.loopStates[node.id];
  if (!loopState) return { kind: "pending" };
  if (loopState.index >= loopState.items.length) {
    return { kind: "settled", status: "SUCCEEDED", output: { iterationCount: loopState.results.length, results: loopState.results } };
  }

  const bodyNodes = graph.nodes.filter((n) => data.bodyNodeIds.includes(n.id));
  const bodyEdges = graph.edges.filter((e) => data.bodyNodeIds.includes(e.source) && data.bodyNodeIds.includes(e.target));
  const subNodeStates = nodeStatesFromRecord(loopState.sub);
  for (const bodyNode of bodyNodes) {
    if (!subNodeStates.has(bodyNode.id)) subNodeStates.set(bodyNode.id, { status: "PENDING", output: null, error: null });
  }

  const subCtx: VariableContext = { ...ctx, workflow: { ...ctx.workflow, [data.itemVar]: loopState.items[loopState.index] }, results: { ...ctx.results } };
  const tickResult = await tickGraph({
    nodes: bodyNodes,
    edges: bodyEdges,
    nodeStates: subNodeStates,
    ctx: subCtx,
    dispatch: (n, c) => dispatchBodyNode(n, c, run, `${node.id}::${loopState.index}::${n.id}`),
    poll: (n) => pollBodyNode(n, subNodeStates, run),
  });
  loopState.sub = nodeStatesToRecord(subNodeStates);

  if (!isSubgraphSettled(bodyNodes, subNodeStates)) {
    return { kind: "pending", progressed: tickResult.progressed };
  }
  if (subgraphHasFailure(bodyNodes, subNodeStates)) {
    return { kind: "settled", status: "FAILED", error: { message: `Itération ${loopState.index} de la boucle "${node.id}" en échec.` } };
  }

  loopState.results.push({
    item: loopState.items[loopState.index],
    results: Object.fromEntries(bodyNodes.map((n) => [n.id, subNodeStates.get(n.id)?.output ?? null])),
  });
  loopState.index += 1;
  loopState.sub = {};
  return { kind: "pending", progressed: true };
}

/* ------------------------------------------------------------------ */
/* Noeud "map" — itération PARALLÈLE du corps (jusqu'à concurrencyLimit) */
/* ------------------------------------------------------------------ */

async function dispatchMapNode(node: AutomationNode, ctx: VariableContext, runState: ReturnType<typeof loadRunState>): Promise<DispatchResult> {
  const data = node.data as MapNodeData;
  let items = resolveCollection(data.collectionExpr, ctx);
  if (data.maxItems && items.length > data.maxItems) items = items.slice(0, data.maxItems);
  runState.mapStates[node.id] = { items, results: {}, done: {}, subs: {} };
  return { kind: "in-flight" };
}

async function pollMapNode(
  node: AutomationNode,
  graph: AutomationGraph,
  ctx: VariableContext,
  run: RunRef,
  runState: ReturnType<typeof loadRunState>
): Promise<PollResult> {
  const data = node.data as MapNodeData;
  const mapState = runState.mapStates[node.id];
  if (!mapState) return { kind: "pending" };

  const total = mapState.items.length;
  if (total === 0) return { kind: "settled", status: "SUCCEEDED", output: { results: [] } };

  const doneCount = Object.values(mapState.done).filter(Boolean).length;
  if (doneCount === total) {
    return { kind: "settled", status: "SUCCEEDED", output: { results: mapState.items.map((_, i) => mapState.results[i] ?? null) } };
  }

  const bodyNodes = graph.nodes.filter((n) => data.bodyNodeIds.includes(n.id));
  const bodyEdges = graph.edges.filter((e) => data.bodyNodeIds.includes(e.source) && data.bodyNodeIds.includes(e.target));
  const limit = data.concurrencyLimit ?? total;

  const started = new Set(Object.keys(mapState.subs).map(Number));
  const active = Array.from(started).filter((i) => !mapState.done[i]);
  let nextIndex = 0;
  while (active.length < limit && nextIndex < total) {
    while ((started.has(nextIndex) || mapState.done[nextIndex]) && nextIndex < total) nextIndex += 1;
    if (nextIndex >= total) break;
    mapState.subs[nextIndex] = {};
    started.add(nextIndex);
    active.push(nextIndex);
    nextIndex += 1;
  }

  let progressedAny = false;
  let failure: { message: string } | null = null;

  for (const index of active) {
    const subNodeStates = nodeStatesFromRecord(mapState.subs[index]);
    for (const bodyNode of bodyNodes) {
      if (!subNodeStates.has(bodyNode.id)) subNodeStates.set(bodyNode.id, { status: "PENDING", output: null, error: null });
    }
    const subCtx: VariableContext = { ...ctx, workflow: { ...ctx.workflow, [data.itemVar]: mapState.items[index] }, results: { ...ctx.results } };
    const tickResult = await tickGraph({
      nodes: bodyNodes,
      edges: bodyEdges,
      nodeStates: subNodeStates,
      ctx: subCtx,
      dispatch: (n, c) => dispatchBodyNode(n, c, run, `${node.id}::${index}::${n.id}`),
      poll: (n) => pollBodyNode(n, subNodeStates, run),
    });
    mapState.subs[index] = nodeStatesToRecord(subNodeStates);
    if (tickResult.progressed) progressedAny = true;

    if (isSubgraphSettled(bodyNodes, subNodeStates)) {
      if (subgraphHasFailure(bodyNodes, subNodeStates)) {
        failure = { message: `Élément ${index} du "map" "${node.id}" en échec.` };
        break;
      }
      mapState.results[index] = Object.fromEntries(bodyNodes.map((n) => [n.id, subNodeStates.get(n.id)?.output ?? null]));
      mapState.done[index] = true;
      progressedAny = true;
    }
  }

  if (failure) return { kind: "settled", status: "FAILED", error: failure };

  const nowDone = Object.values(mapState.done).filter(Boolean).length;
  if (nowDone === total) {
    return { kind: "settled", status: "SUCCEEDED", output: { results: mapState.items.map((_, i) => mapState.results[i] ?? null) } };
  }
  return { kind: "pending", progressed: progressedAny };
}

/* ------------------------------------------------------------------ */
/* Noeud "subautomation" — appel ASYNCHRONE d'une automatisation enfant  */
/* ------------------------------------------------------------------ */

async function dispatchSubautomationNode(data: SubautomationNodeData, ctx: VariableContext, run: RunRef): Promise<DispatchResult> {
  const resolvedInput = resolveActionInput(data.input ?? {}, ctx) as Record<string, unknown>;
  const target = await prisma.automation.findFirst({ where: { workspaceId: run.workspaceId, key: data.automationKey, status: "ACTIVE" } });
  if (!target?.activeVersionId) throw new NotFoundError(`Aucune automatisation active trouvée pour la clé "${data.automationKey}".`);

  const childRun = await createAutomationRun({
    organizationId: run.organizationId,
    workspaceId: run.workspaceId,
    automationId: target.id,
    automationVersionId: target.activeVersionId,
    input: resolvedInput,
    trigger: "AUTOMATION",
    parentRunId: run.id,
  });
  return { kind: "in-flight", output: { childRunId: childRun.id } };
}

async function pollSubautomationNode(node: AutomationNode, nodeStates: Map<string, NodeState>): Promise<PollResult> {
  const state = nodeStates.get(node.id)!;
  const childRunId = (state.output as { childRunId?: string } | null)?.childRunId;
  if (!childRunId) return { kind: "pending" };

  const child = await prisma.automationRun.findUniqueOrThrow({ where: { id: childRunId } });
  if (child.status === "SUCCEEDED") return { kind: "settled", status: "SUCCEEDED", output: child.output };
  if (child.status === "FAILED" || child.status === "CANCELLED" || child.status === "TIMED_OUT") {
    return { kind: "settled", status: "FAILED", error: { message: `Automatisation enfant "${childRunId}" en échec (${child.status}).` } };
  }
  return { kind: "pending" };
}

/* ------------------------------------------------------------------ */
/* Dispatch/poll de premier niveau                                       */
/* ------------------------------------------------------------------ */

function dispatchJoinNode(node: AutomationNode, edges: AutomationGraph["edges"], nodeStates: Map<string, NodeState>): DispatchResult {
  const mode = (node.data as JoinNodeData).mode ?? "any";
  const incoming = edges.filter((e) => e.target === node.id);
  const anySatisfied = incoming.length === 0 || incoming.some((e) => nodeStates.get(e.source)!.status === "SUCCEEDED");
  return { kind: "settled", status: anySatisfied ? "SUCCEEDED" : "SKIPPED", output: { mode } };
}

async function dispatchTopNode(
  node: AutomationNode,
  graph: AutomationGraph,
  ctx: VariableContext,
  run: RunRef,
  runState: ReturnType<typeof loadRunState>,
  nodeStates: Map<string, NodeState>
): Promise<DispatchResult> {
  switch (node.type) {
    case "trigger":
      return { kind: "settled", status: "SUCCEEDED", output: ctx.context };
    case "condition": {
      const result = evaluateRule((node.data as ConditionNodeData).rule, ctx);
      return { kind: "settled", status: "SUCCEEDED", output: { result, branch: result ? "true" : "false" } };
    }
    case "switch": {
      const data = node.data as SwitchNodeData;
      const matched = data.cases.find((c) => evaluateRule(c.rule, ctx));
      return { kind: "settled", status: "SUCCEEDED", output: { branch: matched?.branch ?? "default" } };
    }
    case "join":
      return dispatchJoinNode(node, graph.edges, nodeStates);
    case "end":
      return { kind: "settled", status: "SUCCEEDED", output: { ...ctx.results } };
    case "wait": {
      const data = node.data as WaitNodeData;
      const resumeAt = data.delayMs ? new Date(Date.now() + data.delayMs) : data.until ? new Date(String(resolveExpr(data.until, ctx))) : new Date();
      return { kind: "suspend", resumeAt };
    }
    case "action":
      return dispatchActionNode(node.data as ActionNodeData, ctx, run, node.id);
    case "loop":
      return dispatchLoopNode(node, ctx, runState);
    case "map":
      return dispatchMapNode(node, ctx, runState);
    case "subautomation":
      return dispatchSubautomationNode(node.data as SubautomationNodeData, ctx, run);
    default: {
      const exhaustive: never = node.type;
      throw new Error(`Type de noeud non géré : ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function pollTopNode(
  node: AutomationNode,
  graph: AutomationGraph,
  ctx: VariableContext,
  run: RunRef,
  runState: ReturnType<typeof loadRunState>,
  nodeStates: Map<string, NodeState>
): Promise<PollResult> {
  switch (node.type) {
    case "action":
      return pollActionNode(node, node.data as ActionNodeData, nodeStates, run);
    case "loop":
      return pollLoopNode(node, graph, ctx, run, runState);
    case "map":
      return pollMapNode(node, graph, ctx, run, runState);
    case "subautomation":
      return pollSubautomationNode(node, nodeStates);
    default:
      return { kind: "pending" };
  }
}

/* ------------------------------------------------------------------ */
/* advanceAutomationRun — progression du graphe                         */
/* ------------------------------------------------------------------ */

/**
 * Fait progresser un `AutomationRun` d'une "génération" : ré-entrant et
 * idempotent (recharge systématiquement l'état persisté plutôt que de
 * supposer un état en mémoire), jamais bloquant sur un `AutomationJob` ou
 * un sous-run en vol — l'appel revient dès qu'il n'y a plus rien à faire
 * IMMÉDIATEMENT, une prochaine avancée (fin de job → `processAutomationJobs`,
 * ou cron de sécurité) reprendra la suite. Voir ADR 0031.
 */
export async function advanceAutomationRun(runId: string): Promise<void> {
  const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
  if (TERMINAL_RUN_STATUSES.has(run.status)) return;

  const version = await prisma.automationVersion.findUniqueOrThrow({ where: { id: run.automationVersionId } });
  const graph = version.graph as unknown as AutomationGraph;
  const runRef: RunRef = { id: run.id, organizationId: run.organizationId, workspaceId: run.workspaceId, automationId: run.automationId, createdById: run.createdById };

  if (run.status === "QUEUED") {
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: run.startedAt ?? new Date(), attempt: { increment: 1 } },
    });
    await logRun(runId, null, "info", "Exécution démarrée (ou reprise).");
  }

  const runState = loadRunState(run.context);
  const subordinateIds = collectSubordinateNodeIds(graph.nodes);
  const topNodes = graph.nodes.filter((n) => !subordinateIds.has(n.id));
  const topEdges = graph.edges.filter((e) => !subordinateIds.has(e.source) && !subordinateIds.has(e.target));

  const nodeStates = nodeStatesFromRecord(runState.nodeStates);
  for (const node of topNodes) {
    if (!nodeStates.has(node.id)) nodeStates.set(node.id, { status: "PENDING", output: null, error: null });
  }

  for (const node of topNodes) {
    if (node.type === "wait" && nodeStates.get(node.id)?.status === "WAITING") {
      nodeStates.set(node.id, { status: "SUCCEEDED", output: { resumed: true }, error: null });
      await logRun(runId, node.id, "info", "Reprise après attente.");
    }
  }

  const ctx = createEmptyVariableContext({ organizationId: run.organizationId, workspaceId: run.workspaceId });
  ctx.context = (run.input as Record<string, unknown>) ?? {};
  ctx.form = (run.input as Record<string, unknown>) ?? {};
  ctx.workflow = runState.variables;
  for (const [nodeId, state] of nodeStates) {
    if (state.status === "SUCCEEDED") ctx.results[nodeId] = state.output;
  }

  const tickResult = await tickGraph({
    nodes: topNodes,
    edges: topEdges,
    nodeStates,
    ctx,
    dispatch: (node, c) => dispatchTopNode(node, graph, c, runRef, runState, nodeStates),
    poll: (node, c) => pollTopNode(node, graph, c, runRef, runState, nodeStates),
  });

  runState.variables = ctx.workflow;
  runState.nodeStates = nodeStatesToRecord(nodeStates);

  if (tickResult.suspended) {
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: "WAITING", resumeAt: tickResult.suspended.resumeAt, context: runState as never },
    });
    await logRun(runId, tickResult.suspended.nodeId, "info", "Exécution suspendue (noeud d'attente).", { resumeAt: tickResult.suspended.resumeAt });
    return;
  }

  const isHaltingFailure = (n: AutomationNode) => {
    const s = nodeStates.get(n.id)!;
    return s.status === "FAILED" && s.error?.policy !== "alternative_branch";
  };
  const failedNode = topNodes.find(isHaltingFailure);
  if (failedNode) {
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: "FAILED", finishedAt: new Date(), error: nodeStates.get(failedNode.id)!.error as never, context: runState as never },
    });
    await logRun(runId, failedNode.id, "error", `Noeud "${failedNode.id}" en échec — exécution arrêtée.`);
    await notifyParentRun(run.parentRunId);
    return;
  }

  const allSettled = topNodes.every((n) => TERMINAL_NODE_STATUSES.has(nodeStates.get(n.id)!.status));
  if (!allSettled) {
    await prisma.automationRun.update({ where: { id: runId }, data: { context: runState as never } });
    return;
  }

  const endNode = topNodes.find((n) => n.type === "end");
  const output = endNode ? nodeStates.get(endNode.id)!.output : Object.fromEntries(topNodes.map((n) => [n.id, nodeStates.get(n.id)!.output]));
  await prisma.automationRun.update({
    where: { id: runId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), output: output as never, context: runState as never },
  });
  await logRun(runId, null, "info", "Exécution terminée avec succès.");
  await notifyParentRun(run.parentRunId);
}

/**
 * Un `AutomationRun` enfant (créé par un noeud `subautomation`, ou par le
 * job `automation.call`) devenu terminal ne fait progresser son parent que
 * si celui-ci est explicitement notifié — rien d'autre ne le fait, le
 * parent n'étant ni `QUEUED` (jamais repris par `processQueuedAutomationRuns`)
 * ni propriétaire du job qui vient de se terminer (`processAutomationJobs`
 * ne rappelle `advanceAutomationRun` que sur le run DU JOB, jamais son
 * arbre d'ascendance). Best-effort : une erreur ici ne doit jamais faire
 * échouer la mise à jour du run enfant lui-même.
 */
async function notifyParentRun(parentRunId: string | null): Promise<void> {
  if (!parentRunId) return;
  await advanceAutomationRun(parentRunId).catch((error) => logger.error({ err: error, runId: parentRunId }, "Échec de l'avancée du run parent."));
}

export async function cancelAutomationRun(runId: string) {
  const run = await prisma.automationRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Exécution d'automatisation introuvable.");
  if (run.status !== "QUEUED" && run.status !== "RUNNING" && run.status !== "WAITING") {
    throw new ValidationError("Seule une exécution en attente ou en cours peut être annulée.");
  }
  await prisma.automationJob.updateMany({
    where: { automationRunId: runId, status: { in: ["QUEUED", "CLAIMED", "RUNNING", "WAITING"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
  });
  const cancelled = await prisma.automationRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
  });
  await notifyParentRun(run.parentRunId);
  return cancelled;
}

type ActorRef = Pick<WorkspaceActor, "organization" | "workspace" | "user">;

/**
 * Déclenchement manuel ("Déclencheur manuel", voir `triggers/builtin-triggers.ts`).
 * Crée le run puis appelle `advanceAutomationRun` UNE SEULE FOIS pour
 * l'amorcer — contrairement à `workflows/workflow-service.ts#triggerManualRun`
 * (qui exécute le workflow jusqu'à un état stable de façon synchrone), ne
 * bloque jamais en attendant sa fin : le noyau de jobs poursuit de façon
 * asynchrone (voir ADR 0031). Le run renvoyé peut donc être `RUNNING`.
 */
export async function triggerManualAutomationRun(actor: ActorRef, automationId: string, input?: unknown) {
  const automation = await resolveAutomationForActor(actor, automationId);
  if (!automation.activeVersionId) {
    throw new ValidationError("L'automatisation doit avoir une version active pour être déclenchée.");
  }

  const run = await createAutomationRun({
    organizationId: actor.organization.id,
    workspaceId: actor.workspace.id,
    automationId: automation.id,
    automationVersionId: automation.activeVersionId,
    input,
    trigger: "MANUAL",
    createdById: actor.user.id,
  });
  await advanceAutomationRun(run.id);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.run_triggered",
    entityType: "AutomationRun",
    entityId: run.id,
    metadata: { automationId: automation.id },
  });

  return prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
}

/** Relance un run terminé en échec/annulé — crée un NOUVEAU run (jamais de modification en place), lié via `parentRunId` (même convention que `automation.call`/`subautomation`). */
export async function retryAutomationRun(actor: ActorRef, runId: string) {
  const previous = await resolveAutomationRunForActor(actor, runId);
  if (!["FAILED", "TIMED_OUT", "CANCELLED"].includes(previous.status)) {
    throw new ValidationError(`Seul un run terminé en échec/annulé peut être relancé (statut actuel : "${previous.status}").`);
  }

  const run = await createAutomationRun({
    organizationId: previous.organizationId,
    workspaceId: previous.workspaceId,
    automationId: previous.automationId,
    automationVersionId: previous.automationVersionId,
    input: previous.input,
    trigger: previous.trigger,
    triggerKey: previous.triggerKey ?? undefined,
    parentRunId: previous.id,
    createdById: actor.user.id,
  });
  await advanceAutomationRun(run.id);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.run_retried",
    entityType: "AutomationRun",
    entityId: run.id,
    metadata: { previousRunId: previous.id },
  });

  return prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
}

/** Runs `QUEUED` prêts à démarrer (appelé par le cron, voir `POST /api/cron/process-automations`). */
export async function processQueuedAutomationRuns(now: Date = new Date()) {
  const due = await prisma.automationRun.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: now } },
    orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
    select: { id: true },
    take: MAX_RUNS_PER_BATCH,
  });
  const results: { runId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) {
    try {
      await advanceAutomationRun(id);
      results.push({ runId: id, ok: true });
    } catch (error) {
      results.push({ runId: id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/** Runs `WAITING` dont le délai est écoulé. */
export async function processDueAutomationRunWaits(now: Date = new Date()) {
  const due = await prisma.automationRun.findMany({
    where: { status: "WAITING", resumeAt: { lte: now } },
    select: { id: true },
    take: MAX_RUNS_PER_BATCH,
  });
  const results: { runId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) {
    try {
      await advanceAutomationRun(id);
      results.push({ runId: id, ok: true });
    } catch (error) {
      results.push({ runId: id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* processAutomationJobs — le worker du noyau de jobs                    */
/* ------------------------------------------------------------------ */

async function executeOneJob(job: AutomationJob, workerId: string): Promise<"succeeded" | "retried" | "dead-lettered"> {
  const circuitKey = `jobType:${job.jobType}`;
  if (await isCircuitOpen(circuitKey)) {
    await prisma.automationJob.update({
      where: { id: job.id },
      data: { status: "QUEUED", scheduledAt: new Date(Date.now() + 5_000), claimedAt: null, claimedBy: null },
    });
    return "retried";
  }

  const lockAcquired = job.lockKey
    ? await getActiveLockManager().tryAcquire({ lockKey: job.lockKey, holderId: workerId, leaseMs: (job.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS) + 10_000 })
    : true;
  if (!lockAcquired) {
    await prisma.automationJob.update({
      where: { id: job.id },
      data: { status: "QUEUED", scheduledAt: new Date(Date.now() + 2_000), claimedAt: null, claimedBy: null },
    });
    return "retried";
  }

  const attempt = job.attempt + 1;
  const firstAttemptAt = job.startedAt ?? new Date();
  await prisma.automationJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: job.startedAt ?? new Date(), attempt } });
  await logJob(job.id, "info", `Tentative ${attempt} démarrée.`);

  const handler = getAutomationJobHandler(job.jobType);
  const variables: Record<string, unknown> = {};
  const jobContext: AutomationJobContext = {
    organizationId: job.organizationId,
    workspaceId: job.workspaceId,
    jobId: job.id,
    runId: job.automationRunId ?? undefined,
    nodeId: job.nodeId ?? undefined,
    setVariable: (name, value) => {
      variables[name] = value;
    },
    log: (level, message, metadata) => logJob(job.id, level, message, metadata),
  };

  try {
    if (!handler) throw new NotFoundError(`Type de job "${job.jobType}" non enregistré.`);
    const startedAt = job.startedAt ?? new Date();
    const output = await withTimeout(handler.execute(job.input, jobContext), job.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS);
    const durationMs = Date.now() - startedAt.getTime();

    await prisma.automationJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), output: output as never, durationMs } });
    await logJob(job.id, "info", "Tentative réussie.");
    await recordCircuitSuccess(circuitKey);
    if (job.lockKey) await getActiveLockManager().release({ lockKey: job.lockKey, holderId: workerId });

    if (job.automationRunId && Object.keys(variables).length > 0) {
      const run = await prisma.automationRun.findUnique({ where: { id: job.automationRunId } });
      if (run) {
        const state = loadRunState(run.context);
        state.variables = { ...state.variables, ...variables };
        await prisma.automationRun.update({ where: { id: job.automationRunId }, data: { context: state as never } });
      }
    }
    if (job.automationRunId) {
      await advanceAutomationRun(job.automationRunId).catch((error) =>
        logger.error({ err: error, runId: job.automationRunId }, "Échec de l'avancée du run après succès du job.")
      );
    }
    return "succeeded";
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === "AUTOMATION_JOB_TIMEOUT";
    const message = error instanceof Error ? error.message : String(error);
    await logJob(job.id, "error", `Tentative ${attempt} en échec${isTimeout ? " (délai dépassé)" : ""}.`, { error: message });
    await recordCircuitFailure(circuitKey);
    if (job.lockKey) await getActiveLockManager().release({ lockKey: job.lockKey, holderId: workerId });

    const policy = (job.retryPolicy as RetryPolicy | null) ?? DEFAULT_RETRY_POLICY;
    const decision = decideRetry({ policy, attempt, error: { message }, firstAttemptAt });

    if (decision.shouldRetry) {
      await prisma.automationJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", scheduledAt: new Date(Date.now() + decision.delayMs), claimedAt: null, claimedBy: null, error: { message } as never },
      });
      return "retried";
    }

    await sendToDeadLetter(job.id, message);
    if (job.automationRunId) {
      await advanceAutomationRun(job.automationRunId).catch((err) =>
        logger.error({ err, runId: job.automationRunId }, "Échec de l'avancée du run après mise en DLQ du job.")
      );
    }
    return "dead-lettered";
  }
}

export type ProcessAutomationJobsResult = { claimed: number; admitted: number; deferred: number; succeeded: number; retried: number; deadLettered: number };

/**
 * Le worker du noyau de jobs (appelé par le cron, voir
 * `POST /api/cron/process-automation-jobs`) : réclame un lot via le Queue
 * Manager actif, applique le Concurrency Manager, puis exécute chaque job
 * admis (verrou, disjoncteur, minuteur, Retry Engine, DLQ).
 */
export async function processAutomationJobs(params: { workerId?: string; limit?: number } = {}): Promise<ProcessAutomationJobsResult> {
  registerBuiltInAutomationActions();
  const workerId = params.workerId ?? `worker-${crypto.randomUUID()}`;
  const requestedLimit = params.limit ?? getWorkerPoolSize();

  const globalCapacity = await remainingGlobalCapacity();
  const limit = globalCapacity === null ? requestedLimit : Math.min(requestedLimit, globalCapacity);
  const empty: ProcessAutomationJobsResult = { claimed: 0, admitted: 0, deferred: 0, succeeded: 0, retried: 0, deadLettered: 0 };
  if (limit <= 0) return empty;

  const provider = getActiveQueueProvider();
  const claimed = await provider.claim({ limit, workerId });
  if (claimed.length === 0) return empty;

  const claimedJobs = await prisma.automationJob.findMany({ where: { id: { in: claimed.map((c) => c.id) } } });
  const { admitted, deferred } = await admitByConcurrency(
    claimedJobs.map((j) => ({ id: j.id, concurrencyKey: j.concurrencyKey, concurrencyLimit: j.concurrencyLimit, rateLimitKey: j.rateLimitKey }))
  );

  if (deferred.length > 0) {
    await prisma.automationJob.updateMany({ where: { id: { in: deferred } }, data: { status: "QUEUED", claimedAt: null, claimedBy: null } });
  }

  let succeeded = 0;
  let retried = 0;
  let deadLettered = 0;
  for (const jobId of admitted) {
    const job = claimedJobs.find((j) => j.id === jobId)!;
    const outcome = await executeOneJob(job, workerId);
    if (outcome === "succeeded") succeeded += 1;
    else if (outcome === "retried") retried += 1;
    else deadLettered += 1;
  }

  return { claimed: claimed.length, admitted: admitted.length, deferred: deferred.length, succeeded, retried, deadLettered };
}
