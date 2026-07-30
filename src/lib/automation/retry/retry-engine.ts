import "server-only";
import { evaluateRule, createEmptyVariableContext, type Rule } from "@/lib/automation/conditions";

/**
 * Retry Engine (Automation Engine, v0.8) : décide, après l'échec d'une
 * tentative de `AutomationJob`, si une nouvelle tentative doit avoir lieu
 * et après quel délai. Sept stratégies nommées explicitement (voir brief),
 * qui partagent deux formes de délai (`exponentialDelay`/`linearDelay`)
 * plutôt que sept implémentations indépendantes — la nuance entre elles
 * est la politique d'arrêt (plafond de tentatives, durée totale,
 * condition sur l'erreur, ou aucune tentative automatique du tout).
 *
 * "conditional" réutilise directement le Condition Engine (`Rule`/
 * `evaluateRule`, voir ADR 0034/0028) : la règle est évaluée contre un
 * contexte minimal exposant l'erreur sous `context.error.*`.
 */
export type BackoffStrategy = "exponential" | "linear" | "immediate" | "manual" | "conditional" | "infinite" | "limited";

export type RetryPolicy = {
  strategy: BackoffStrategy;
  /** Requis pour "limited" ; plafond optionnel pour "exponential"/"linear"/"conditional" (défaut 5) et "immediate" (défaut 3). Ignoré pour "infinite"/"manual". */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Ajoute un facteur aléatoire au délai calculé (évite l'effet "troupeau" de plusieurs jobs retentant au même instant). */
  jitter?: boolean;
  /** Requis pour "conditional" : la nouvelle tentative n'a lieu que si cette règle s'évalue à `true` contre l'erreur, exposée sous le chemin `context.error.message` (même convention de portées que `VariableContext`, voir `workflows/expressions/variable-context.ts`). */
  conditionRule?: Rule;
  /** Pour "infinite" seulement : arrête les tentatives après cette durée totale écoulée depuis la première, sans quoi les tentatives sont illimitées. */
  maxDurationMs?: number;
};

export type RetryDecision = { shouldRetry: boolean; delayMs: number };

const DEFAULT_BASE_DELAY_MS = 5_000;
const DEFAULT_MAX_DELAY_MS = 5 * 60_000;

function exponentialDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, jitter: boolean): number {
  const raw = Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), maxDelayMs);
  return jitter ? Math.floor(Math.random() * raw) : raw;
}

function linearDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * attempt, maxDelayMs);
}

function evaluateConditionRule(rule: Rule, error: { message: string }): boolean {
  const ctx = createEmptyVariableContext({ organizationId: "", workspaceId: "" });
  ctx.context = { error };
  return evaluateRule(rule, ctx);
}

/**
 * `attempt` est le numéro de la tentative qui vient d'échouer (1 = la
 * toute première). Renvoie si une nouvelle tentative doit être planifiée,
 * et après quel délai.
 */
export function decideRetry(params: {
  policy: RetryPolicy;
  attempt: number;
  error: { message: string };
  firstAttemptAt: Date;
  now?: Date;
}): RetryDecision {
  const { policy, attempt, error } = params;
  const now = params.now ?? new Date();
  const baseDelayMs = policy.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = policy.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitter = policy.jitter ?? false;

  switch (policy.strategy) {
    case "manual":
      return { shouldRetry: false, delayMs: 0 };

    case "immediate": {
      const maxAttempts = policy.maxAttempts ?? 3;
      return { shouldRetry: attempt < maxAttempts, delayMs: 0 };
    }

    case "linear": {
      const maxAttempts = policy.maxAttempts ?? 5;
      return { shouldRetry: attempt < maxAttempts, delayMs: linearDelay(attempt, baseDelayMs, maxDelayMs) };
    }

    case "exponential": {
      const maxAttempts = policy.maxAttempts ?? 5;
      return { shouldRetry: attempt < maxAttempts, delayMs: exponentialDelay(attempt, baseDelayMs, maxDelayMs, jitter) };
    }

    case "limited": {
      if (!policy.maxAttempts) {
        throw new Error('La stratégie de retry "limited" nécessite "maxAttempts".');
      }
      return { shouldRetry: attempt < policy.maxAttempts, delayMs: exponentialDelay(attempt, baseDelayMs, maxDelayMs, jitter) };
    }

    case "infinite": {
      const elapsedMs = now.getTime() - params.firstAttemptAt.getTime();
      if (policy.maxDurationMs && elapsedMs >= policy.maxDurationMs) return { shouldRetry: false, delayMs: 0 };
      return { shouldRetry: true, delayMs: exponentialDelay(attempt, baseDelayMs, maxDelayMs, jitter) };
    }

    case "conditional": {
      if (!policy.conditionRule) {
        throw new Error('La stratégie de retry "conditional" nécessite "conditionRule".');
      }
      if (!evaluateConditionRule(policy.conditionRule, error)) return { shouldRetry: false, delayMs: 0 };
      const maxAttempts = policy.maxAttempts ?? 5;
      return { shouldRetry: attempt < maxAttempts, delayMs: exponentialDelay(attempt, baseDelayMs, maxDelayMs, jitter) };
    }

    default: {
      const exhaustive: never = policy.strategy;
      throw new Error(`Stratégie de retry non gérée : ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Politique par défaut appliquée à un `AutomationJob` qui n'en déclare aucune — exponentiel borné, raisonnable pour la plupart des actions. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = { strategy: "exponential", maxAttempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000, jitter: true };
