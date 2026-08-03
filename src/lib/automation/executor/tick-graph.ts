import type { VariableContext } from "../conditions";
import type { AutomationEdge, AutomationNode } from "../graph-types";
import { computeReadyNodes, type NodeState } from "./run-state";

/**
 * Moteur de tick générique — utilisé pour le graphe racine d'un
 * `AutomationRun` COMME pour le corps d'un noeud `loop`/`map` (un seul et
 * même algorithme, jamais dupliqué) : à chaque génération, sonde
 * (`poll`) les noeuds déjà en cours (`RUNNING`), puis dispatche
 * (`dispatch`) les noeuds nouvellement prêts, jusqu'à ce que plus rien ne
 * progresse dans cet appel — la suite (un job qui se termine, un
 * sous-run enfant qui aboutit) reprendra au prochain appel.
 */
export type DispatchResult =
  | { kind: "settled"; status: "SUCCEEDED" | "FAILED" | "SKIPPED"; output?: unknown; error?: { message: string; policy?: string } }
  | { kind: "in-flight"; output?: unknown }
  | { kind: "suspend"; resumeAt: Date };

export type PollResult =
  | { kind: "settled"; status: "SUCCEEDED" | "FAILED" | "SKIPPED"; output?: unknown; error?: { message: string; policy?: string } }
  | { kind: "pending"; progressed?: boolean };

export type TickResult = { suspended?: { nodeId: string; resumeAt: Date }; progressed: boolean };

const MAX_TICK_GENERATIONS_PER_CALL = 200;

export async function tickGraph(params: {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  nodeStates: Map<string, NodeState>;
  ctx: VariableContext;
  dispatch: (node: AutomationNode, ctx: VariableContext) => Promise<DispatchResult>;
  poll: (node: AutomationNode, ctx: VariableContext) => Promise<PollResult>;
}): Promise<TickResult> {
  const { nodes, edges, nodeStates, ctx, dispatch, poll } = params;
  let everProgressed = false;
  let progressed = true;
  let generation = 0;

  while (progressed && generation < MAX_TICK_GENERATIONS_PER_CALL) {
    generation += 1;
    progressed = false;

    for (const node of nodes) {
      const state = nodeStates.get(node.id);
      if (state?.status !== "RUNNING") continue;
      const polled = await poll(node, ctx);
      if (polled.kind === "settled") {
        nodeStates.set(node.id, { status: polled.status, output: polled.output ?? null, error: polled.error ?? null });
        if (polled.status === "SUCCEEDED") ctx.results[node.id] = polled.output;
        progressed = true;
      } else if (polled.progressed) {
        progressed = true;
      }
    }

    const { ready, skippedAny } = computeReadyNodes(nodes, edges, nodeStates);
    if (skippedAny) progressed = true;

    for (const node of ready) {
      const dispatched = await dispatch(node, ctx);
      if (dispatched.kind === "settled") {
        nodeStates.set(node.id, { status: dispatched.status, output: dispatched.output ?? null, error: dispatched.error ?? null });
        if (dispatched.status === "SUCCEEDED") ctx.results[node.id] = dispatched.output;
      } else if (dispatched.kind === "in-flight") {
        nodeStates.set(node.id, { status: "RUNNING", output: dispatched.output ?? null, error: null });
      } else {
        nodeStates.set(node.id, { status: "WAITING", output: null, error: null });
        everProgressed = true;
        return { suspended: { nodeId: node.id, resumeAt: dispatched.resumeAt }, progressed: everProgressed };
      }
      progressed = true;
    }

    if (progressed) everProgressed = true;
  }

  return { progressed: everProgressed };
}
