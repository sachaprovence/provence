import "server-only";
import { logger } from "@/lib/logger";
import type { Expr } from "../graph-types";
import type { VariableContext } from "../expressions/variable-context";

/**
 * Registre d'opérateurs de règle personnalisés (voir `Rule` — `op:
 * "custom"`). Les opérateurs de base (eq/neq/gt/.../and/or/not/regex/
 * exists/in/date/permission) sont câblés directement dans
 * `expressions/evaluator.ts` ; ce registre couvre l'extensibilité au-delà
 * de ce socle, même principe Map que `scoring-engine.ts` (v0.5) ou
 * `tool-registry.ts` (v0.3).
 */
export type CustomRuleEvaluator = (args: unknown[], ctx: VariableContext) => boolean;

const customOperators = new Map<string, CustomRuleEvaluator>();

export function registerConditionOperator(key: string, evaluate: CustomRuleEvaluator): void {
  if (customOperators.has(key)) {
    logger.debug({ key }, "Opérateur de condition personnalisé réenregistré (remplace le précédent).");
  }
  customOperators.set(key, evaluate);
}

export function getConditionOperator(key: string): CustomRuleEvaluator | undefined {
  return customOperators.get(key);
}

export function listConditionOperatorKeys(): string[] {
  return Array.from(customOperators.keys());
}

export type { Expr };
