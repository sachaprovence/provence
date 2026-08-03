import type { Rule, Expr } from "./conditions";

/**
 * Forme du graphe stocké dans `AutomationVersion.graph` — même principe
 * déclaratif que `workflows/graph-types.ts` (v0.6, voir ADR 0018) : un
 * noeud ne référence jamais de code exécutable, seulement une clé résolue
 * par un registre (`triggers/registry.ts`, `actions/registry.ts`).
 *
 * Différences volontaires avec le Workflow Engine (voir ADR 0031) :
 * - chaque noeud `action` s'exécute comme un `AutomationJob` DURABLE (le
 *   noyau de jobs), pas un simple appel en mémoire ;
 * - `switch` (branchement à N voies, pas seulement vrai/faux) ;
 * - `map` (itération PARALLÈLE — un job enfant par élément — par
 *   opposition à `loop`, séquentielle) ;
 * - `join` explicite avec un mode `all`/`any` déclaré — referme le point
 *   laissé ouvert par ADR 0019 ("jointure OU" implicite du Workflow
 *   Engine) sans jamais modifier ce dernier.
 */
export type { Rule, Expr };

export type AutomationErrorPolicy =
  | { kind: "stop" }
  | { kind: "retry" } // délègue au Retry Engine (voir AutomationJob.retryPolicy), pas de config dupliquée ici
  | { kind: "ignore" }
  | { kind: "alternative_branch" }
  | { kind: "notify" }
  | { kind: "escalate_director" };

export type AutomationNodeType =
  | "trigger"
  | "condition"
  | "switch"
  | "action"
  | "loop"
  | "map"
  | "wait"
  | "join"
  | "subautomation"
  | "end";

export type TriggerNodeData = { triggerKey: string; config?: Record<string, unknown> };
export type ConditionNodeData = { rule: Rule };
/** Évalue chaque `case` dans l'ordre, emprunte la première branche dont la règle est vraie ; `default` sinon. */
export type SwitchNodeData = { cases: { rule: Rule; branch: string }[] };

export type RetryPolicyRef = {
  strategy: "exponential" | "linear" | "immediate" | "manual" | "conditional" | "infinite" | "limited";
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  conditionRule?: Rule;
  maxDurationMs?: number;
};

export type ActionNodeData = {
  jobType: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
  priority?: number;
  retryPolicy?: RetryPolicyRef;
  lockKey?: string;
  concurrencyKey?: string;
  concurrencyLimit?: number;
  rateLimitKey?: string;
  onError?: AutomationErrorPolicy;
  compensateJobType?: string;
};

export type LoopNodeData = { collectionExpr: Expr; itemVar: string; bodyNodeIds: string[]; maxIterations?: number };
/** Comme `loop` (même forme : collection + corps de noeuds), mais chaque itération devient un `AutomationJob` enfant indépendant, exécuté concurremment (jusqu'à `concurrencyLimit`) plutôt que séquentiellement. */
export type MapNodeData = {
  collectionExpr: Expr;
  itemVar: string;
  bodyNodeIds: string[];
  concurrencyLimit?: number;
  maxItems?: number;
};
export type WaitNodeData = { delayMs?: number; until?: Expr };
/** `mode: "all"` attend que TOUTES les arêtes entrantes soient terminales et satisfaites ; `"any"` (défaut, comme le Workflow Engine) dès qu'une l'est. */
export type JoinNodeData = { mode: "all" | "any" };
export type SubautomationNodeData = { automationKey: string; input?: Record<string, unknown> };
export type EndNodeData = Record<string, never>;

export type AutomationNodeData =
  | TriggerNodeData
  | ConditionNodeData
  | SwitchNodeData
  | ActionNodeData
  | LoopNodeData
  | MapNodeData
  | WaitNodeData
  | JoinNodeData
  | SubautomationNodeData
  | EndNodeData;

export type AutomationNode = {
  id: string;
  type: AutomationNodeType;
  position: { x: number; y: number };
  label?: string;
  data: AutomationNodeData;
};

export type AutomationEdge = {
  id: string;
  source: string;
  target: string;
  /** "true"/"false" (condition), une clé de `cases[].branch` (switch), "error" (branche d'erreur), ou absent (flux normal/fork implicite). */
  branch?: string;
};

export type AutomationVariableDeclaration = {
  name: string;
  scope: "workflow" | "context" | "form";
  description?: string;
  defaultValue?: unknown;
};

export type AutomationGraph = {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  variables?: AutomationVariableDeclaration[];
};
