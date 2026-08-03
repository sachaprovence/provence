import type { Expr, Rule } from "../graph-types";
import { getPath, type VariableContext } from "./variable-context";
import { getConditionOperator } from "../conditions/registry";

/**
 * Évaluateur d'expressions et de règles, volontairement SANS `eval`/`new
 * Function` ni interpréteur de langage arbitraire : un `Expr` ne peut être
 * qu'une valeur littérale ou une référence de variable, un `Rule` ne peut
 * combiner que les opérateurs listés ci-dessous. C'est le choix délibéré
 * qui remplace "Exécuter un script" (voir ADR 0020) — exécuter du code
 * arbitraire fourni par un utilisateur d'un tenant, dans un moteur
 * multi-tenant, est une surface d'attaque inacceptable ; ce sous-ensemble
 * sûr couvre les besoins réels (conditions, calculs simples) sans l'ouvrir.
 */

export function resolveExpr(expr: Expr, ctx: VariableContext): unknown {
  if (expr.kind === "literal") return expr.value;
  return getPath(ctx, expr.path);
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string | number);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function evaluateRule(rule: Rule, ctx: VariableContext): boolean {
  switch (rule.op) {
    case "true":
      return true;
    case "eq":
      return deepEqual(resolveExpr(rule.left, ctx), resolveExpr(rule.right, ctx));
    case "neq":
      return !deepEqual(resolveExpr(rule.left, ctx), resolveExpr(rule.right, ctx));
    case "gt":
      return toNumber(resolveExpr(rule.left, ctx)) > toNumber(resolveExpr(rule.right, ctx));
    case "gte":
      return toNumber(resolveExpr(rule.left, ctx)) >= toNumber(resolveExpr(rule.right, ctx));
    case "lt":
      return toNumber(resolveExpr(rule.left, ctx)) < toNumber(resolveExpr(rule.right, ctx));
    case "lte":
      return toNumber(resolveExpr(rule.left, ctx)) <= toNumber(resolveExpr(rule.right, ctx));
    case "and":
      return rule.rules.every((sub) => evaluateRule(sub, ctx));
    case "or":
      return rule.rules.some((sub) => evaluateRule(sub, ctx));
    case "not":
      return !evaluateRule(rule.rule, ctx);
    case "regex": {
      const value = resolveExpr(rule.value, ctx);
      return typeof value === "string" && new RegExp(rule.pattern, rule.flags).test(value);
    }
    case "exists": {
      const value = resolveExpr(rule.value, ctx);
      return value !== undefined && value !== null;
    }
    case "in": {
      const value = resolveExpr(rule.value, ctx);
      return rule.list.some((item) => deepEqual(resolveExpr(item, ctx), value));
    }
    case "date_before":
      return toDate(resolveExpr(rule.left, ctx)).getTime() < toDate(resolveExpr(rule.right, ctx)).getTime();
    case "date_after":
      return toDate(resolveExpr(rule.left, ctx)).getTime() > toDate(resolveExpr(rule.right, ctx)).getTime();
    case "permission":
      return ctx.permissions.includes(rule.permission);
    case "custom": {
      const evaluator = getConditionOperator(rule.key);
      if (!evaluator) {
        throw new Error(`Opérateur de condition personnalisé "${rule.key}" non enregistré.`);
      }
      return evaluator(
        rule.args.map((arg) => resolveExpr(arg, ctx)),
        ctx
      );
    }
    default: {
      const exhaustive: never = rule;
      throw new Error(`Opérateur de règle non géré : ${JSON.stringify(exhaustive)}`);
    }
  }
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}/g;
const EXACT_VARIABLE_PATTERN = /^\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}$/;

function interpolateString(template: string, ctx: VariableContext): string {
  return template.replace(VARIABLE_PATTERN, (_match, path: string) => {
    const value = getPath(ctx, path);
    return value === undefined || value === null ? "" : String(value);
  });
}

/**
 * Résout récursivement la configuration d'entrée d'une action : une chaîne
 * qui correspond EXACTEMENT à `"{{ chemin }}"` renvoie la valeur telle
 * quelle (préserve le type — nombre, objet, tableau...) ; une chaîne qui
 * contient un ou plusieurs `{{ }}` au milieu d'un texte fait une
 * interpolation textuelle classique. Même convention `{{ }}` que le
 * moteur de prompts (v0.5, `prompt-engine.ts`), pour rester cohérent dans
 * tout Autorun.
 */
export function resolveActionInput(input: unknown, ctx: VariableContext): unknown {
  if (typeof input === "string") {
    const trimmed = input.trim();
    const exact = trimmed.match(EXACT_VARIABLE_PATTERN);
    if (exact) return getPath(ctx, exact[1]);
    return interpolateString(input, ctx);
  }
  if (Array.isArray(input)) return input.map((item) => resolveActionInput(item, ctx));
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, resolveActionInput(value, ctx)])
    );
  }
  return input;
}
