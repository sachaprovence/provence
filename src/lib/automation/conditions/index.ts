/**
 * Condition Engine (Automation Engine, v0.8) : réutilise directement le
 * moteur de règles/expressions du Workflow Engine (`src/lib/workflows/
 * expressions/`, `conditions/registry.ts`, v0.6) plutôt que d'en
 * dupliquer un second — `Rule`/`Expr`/`evaluateRule` sont déjà génériques
 * (aucune dépendance à `WorkflowRun` ou à quoi que ce soit de spécifique
 * au Workflow Engine), exactement ce que demande le brief pour un
 * "Condition Engine" indépendant. Voir ADR 0034.
 *
 * Ce module ne fait que ré-exporter sous l'espace de noms de l'Automation
 * Engine, pour que ses autres composants (Automation Registry, Job
 * Executor, Retry Engine) importent depuis un seul point d'entrée
 * cohérent plutôt que de piocher directement dans `workflows/` un peu
 * partout.
 */
export type { Rule, Expr } from "@/lib/workflows/graph-types";
export type { VariableContext } from "@/lib/workflows/expressions/variable-context";
export { evaluateRule, resolveExpr, resolveActionInput } from "@/lib/workflows/expressions/evaluator";
export { createEmptyVariableContext, getPath, setPath } from "@/lib/workflows/expressions/variable-context";
export { registerConditionOperator, getConditionOperator, listConditionOperatorKeys } from "@/lib/workflows/conditions/registry";
