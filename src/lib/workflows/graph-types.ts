/**
 * Forme du graphe stocké dans `WorkflowVersion.graph` (voir
 * `prisma/schema.prisma`). Purement déclaratif : un noeud ne référence
 * jamais de code directement, seulement une clé résolue à l'exécution par
 * un registre (`triggers/registry.ts`, `actions/registry.ts`) — même
 * principe que `AgentDefinition.runtimeKey` (voir ADR 0007/0018).
 */

export type Expr = { kind: "literal"; value: unknown } | { kind: "var"; path: string };

export type Rule =
  | { op: "true" }
  | { op: "eq"; left: Expr; right: Expr }
  | { op: "neq"; left: Expr; right: Expr }
  | { op: "gt"; left: Expr; right: Expr }
  | { op: "gte"; left: Expr; right: Expr }
  | { op: "lt"; left: Expr; right: Expr }
  | { op: "lte"; left: Expr; right: Expr }
  | { op: "and"; rules: Rule[] }
  | { op: "or"; rules: Rule[] }
  | { op: "not"; rule: Rule }
  | { op: "regex"; value: Expr; pattern: string; flags?: string }
  | { op: "exists"; value: Expr }
  | { op: "in"; value: Expr; list: Expr[] }
  | { op: "date_before"; left: Expr; right: Expr }
  | { op: "date_after"; left: Expr; right: Expr }
  | { op: "permission"; permission: string }
  /** Opérateur personnalisé enregistré via `conditions/registry.ts#registerConditionOperator` — extensibilité du moteur de règles sans modifier ce fichier. */
  | { op: "custom"; key: string; args: Expr[] };

export type WorkflowErrorPolicy =
  | { kind: "stop" }
  | { kind: "retry"; maxAttempts: number; backoffMs?: number }
  | { kind: "ignore" }
  | { kind: "alternative_branch" }
  | { kind: "notify" }
  | { kind: "escalate_director" };

export type WorkflowNodeType = "trigger" | "condition" | "action" | "loop" | "wait" | "subworkflow" | "end";

export type TriggerNodeData = { triggerKey: string; config?: Record<string, unknown> };
export type ConditionNodeData = { rule: Rule };
export type ActionNodeData = {
  actionKey: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
  maxAttempts?: number;
  onError?: WorkflowErrorPolicy;
  /** Clé d'action enregistrée à appeler avec la sortie de cette étape si une étape ULTÉRIEURE du même run échoue et déclenche un rollback logique. */
  compensateActionKey?: string;
};
/**
 * Boucle : itère sur `collectionExpr` (doit résoudre vers un tableau),
 * exécute séquentiellement le sous-graphe `bodyNodeIds` (des noeuds du
 * MÊME graphe, exclus du calcul de disponibilité du niveau racine — voir
 * `execution-engine.ts`) pour chaque élément, exposé sous `itemVar` dans
 * le contexte de variables de l'itération.
 */
export type LoopNodeData = {
  collectionExpr: Expr;
  itemVar: string;
  bodyNodeIds: string[];
  maxIterations?: number;
};
export type WaitNodeData = { delayMs?: number; until?: Expr };
export type SubworkflowNodeData = { workflowKey: string; input?: Record<string, unknown> };
export type EndNodeData = Record<string, never>;

export type WorkflowNodeData =
  | TriggerNodeData
  | ConditionNodeData
  | ActionNodeData
  | LoopNodeData
  | WaitNodeData
  | SubworkflowNodeData
  | EndNodeData;

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  label?: string;
  data: WorkflowNodeData;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  /** "true"/"false" pour une arête sortant d'un noeud `condition` ; "error" pour la branche d'erreur d'un noeud (`onError: "alternative_branch"`) ; absent sinon (flux normal). */
  branch?: "true" | "false" | "error" | string;
};

export type WorkflowVariableDeclaration = {
  name: string;
  scope: "workflow" | "context" | "form";
  description?: string;
  defaultValue?: unknown;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: WorkflowVariableDeclaration[];
};
