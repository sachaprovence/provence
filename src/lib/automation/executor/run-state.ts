import type { AutomationEdge, AutomationNode, ActionNodeData, JoinNodeData } from "../graph-types";

/**
 * État de progression d'un graphe (racine d'un `AutomationRun`, ou corps
 * d'un noeud `loop`/`map`) — jamais tenu seulement en mémoire : persisté
 * dans `AutomationRun.context` (voir `job-executor.ts`) pour rester
 * ré-entrant après un redémarrage de processus, exactement comme
 * `WorkflowRunStep` le fait pour le Workflow Engine (v0.6), mais sans table
 * dédiée : un noeud `action` a déjà sa propre trace durable via
 * `AutomationJob`, ce module ne fait que suivre l'état LOCAL au graphe
 * (prêt/en cours/terminé) entre deux avancées (`advanceAutomationRun`).
 */
export type NodeStatus = "PENDING" | "RUNNING" | "WAITING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export type NodeState = {
  status: NodeStatus;
  output: unknown;
  error: { message: string; policy?: string } | null;
};

export type LoopIterationState = {
  items: unknown[];
  index: number;
  results: unknown[];
  sub: Record<string, NodeState>;
};

export type MapIterationState = {
  items: unknown[];
  results: Record<number, unknown>;
  done: Record<number, boolean>;
  subs: Record<number, Record<string, NodeState>>;
};

export type AutomationRunState = {
  variables: Record<string, unknown>;
  nodeStates: Record<string, NodeState>;
  loopStates: Record<string, LoopIterationState>;
  mapStates: Record<string, MapIterationState>;
};

export function loadRunState(context: unknown): AutomationRunState {
  const raw = (context ?? {}) as Partial<AutomationRunState>;
  return {
    variables: raw.variables ?? {},
    nodeStates: raw.nodeStates ?? {},
    loopStates: raw.loopStates ?? {},
    mapStates: raw.mapStates ?? {},
  };
}

export const TERMINAL_NODE_STATUSES = new Set<NodeStatus>(["SUCCEEDED", "FAILED", "SKIPPED"]);

/**
 * Une arête sortante d'un noeud est "satisfaite" si : le noeud a réussi (et,
 * pour une arête étiquetée `branch`, que la branche corresponde à sa
 * sortie), ou s'il a été ignoré suite à une erreur tolérée (`onError:
 * "ignore"`, arête sans branche uniquement), ou s'il a échoué avec la
 * politique `alternative_branch` et que l'arête est la branche "error" —
 * même sémantique que `workflows/execution-engine.ts#edgeIsSatisfied`.
 */
export function edgeIsSatisfied(edge: AutomationEdge, sourceState: NodeState): boolean {
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

/**
 * Détermine si un noeud PENDING peut être dispatché ("ready"), doit
 * attendre ("wait"), ou n'est jamais atteignable et doit être marqué
 * SKIPPED ("skip"). Cas particulier `join` : mode "all" attend que TOUTES
 * les arêtes entrantes soient terminales (le noeud décide ensuite lui-même,
 * à l'exécution, s'il a réellement fusionné quelque chose) ; mode "any"
 * (défaut) est prêt dès qu'UNE arête entrante est à la fois terminale et
 * satisfaite, sans attendre les autres branches — c'est la sémantique
 * "jointure OU" que le Workflow Engine laissait implicite (voir ADR 0019),
 * ici rendue explicite.
 */
export function isNodeReady(node: AutomationNode, incoming: AutomationEdge[], nodeStates: Map<string, NodeState>): "ready" | "wait" | "skip" {
  if (incoming.length === 0) return "ready";

  if (node.type === "join") {
    const mode = (node.data as JoinNodeData).mode ?? "any";
    if (mode === "all") {
      const allTerminal = incoming.every((edge) => TERMINAL_NODE_STATUSES.has(nodeStates.get(edge.source)!.status));
      return allTerminal ? "ready" : "wait";
    }
    const anySatisfied = incoming.some((edge) => {
      const state = nodeStates.get(edge.source)!;
      return TERMINAL_NODE_STATUSES.has(state.status) && edgeIsSatisfied(edge, state);
    });
    return anySatisfied ? "ready" : "wait";
  }

  const allTerminal = incoming.every((edge) => TERMINAL_NODE_STATUSES.has(nodeStates.get(edge.source)!.status));
  if (!allTerminal) return "wait";
  const satisfied = incoming.some((edge) => edgeIsSatisfied(edge, nodeStates.get(edge.source)!));
  return satisfied ? "ready" : "skip";
}

/** Renvoie les noeuds PENDING désormais prêts à être dispatchés, en marquant SKIPPED (par effet de bord sur `nodeStates`) ceux devenus définitivement inatteignables. */
export function computeReadyNodes(
  nodes: AutomationNode[],
  edges: AutomationEdge[],
  nodeStates: Map<string, NodeState>
): { ready: AutomationNode[]; skippedAny: boolean } {
  const ready: AutomationNode[] = [];
  let skippedAny = false;

  for (const node of nodes) {
    const state = nodeStates.get(node.id);
    if (!state || state.status !== "PENDING") continue;
    const incoming = edges.filter((edge) => edge.target === node.id);
    const outcome = isNodeReady(node, incoming, nodeStates);
    if (outcome === "ready") {
      ready.push(node);
    } else if (outcome === "skip") {
      nodeStates.set(node.id, { status: "SKIPPED", output: null, error: null });
      skippedAny = true;
    }
  }

  return { ready, skippedAny };
}

export function isSubgraphSettled(nodes: AutomationNode[], nodeStates: Map<string, NodeState>): boolean {
  return nodes.every((node) => TERMINAL_NODE_STATUSES.has(nodeStates.get(node.id)?.status ?? "PENDING"));
}

export function subgraphHasFailure(nodes: AutomationNode[], nodeStates: Map<string, NodeState>): boolean {
  return nodes.some((node) => nodeStates.get(node.id)?.status === "FAILED");
}

/** Noeuds appartenant au corps d'un `loop`/`map` — jamais des noeuds "de premier niveau" du graphe, même principe que `workflows/execution-engine.ts#collectSubordinateNodeIds`. */
export function collectSubordinateNodeIds(nodes: AutomationNode[]): Set<string> {
  const subordinate = new Set<string>();
  for (const node of nodes) {
    if (node.type === "loop" || node.type === "map") {
      const bodyNodeIds = (node.data as { bodyNodeIds?: string[] }).bodyNodeIds ?? [];
      for (const id of bodyNodeIds) subordinate.add(id);
    }
  }
  return subordinate;
}

export function defaultErrorPolicy(): NonNullable<ActionNodeData["onError"]> {
  return { kind: "stop" };
}

export function nodeStatesToRecord(nodeStates: Map<string, NodeState>): Record<string, NodeState> {
  return Object.fromEntries(nodeStates.entries());
}

export function nodeStatesFromRecord(record: Record<string, NodeState> | undefined): Map<string, NodeState> {
  return new Map(Object.entries(record ?? {}));
}
