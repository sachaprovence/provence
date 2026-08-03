import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Circuit Breaker (Automation Engine, v0.8) : coupe temporairement les
 * tentatives sur un périmètre donné (`key` — typiquement `automation:<id>`
 * ou `jobType:<clé>`) après un nombre de défaillances consécutives,
 * plutôt que de continuer à retenter (et échouer) contre une dépendance
 * externe en panne. État persisté (`AutomationCircuitBreaker`) pour rester
 * cohérent entre plusieurs processus — voir ADR 0033.
 *
 * Trois états classiques : `CLOSED` (fonctionnement normal) → `OPEN`
 * (bloque tout essai jusqu'à `resetAt`) → `HALF_OPEN` (laisse passer UN
 * essai à titre de test dès que `resetAt` est atteint ; un succès referme
 * le disjoncteur, un échec le rouvre).
 */
export type CircuitBreakerConfig = { failureThreshold: number; resetTimeoutMs: number };

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = { failureThreshold: 5, resetTimeoutMs: 60_000 };

/** `true` si le disjoncteur bloque actuellement les tentatives pour `key`. Fait transitionner `OPEN` → `HALF_OPEN` lui-même si `resetAt` est atteint. */
export async function isCircuitOpen(key: string): Promise<boolean> {
  const breaker = await prisma.automationCircuitBreaker.findUnique({ where: { key } });
  if (!breaker || breaker.state === "CLOSED") return false;

  if (breaker.state === "OPEN") {
    if (breaker.resetAt && breaker.resetAt.getTime() <= Date.now()) {
      await prisma.automationCircuitBreaker.update({ where: { key }, data: { state: "HALF_OPEN" } });
      return false;
    }
    return true;
  }

  // HALF_OPEN : un essai est déjà en cours, laisse passer.
  return false;
}

export async function recordCircuitSuccess(key: string): Promise<void> {
  await prisma.automationCircuitBreaker.upsert({
    where: { key },
    update: { state: "CLOSED", failureCount: 0, openedAt: null, resetAt: null },
    create: { key, state: "CLOSED" },
  });
}

export async function recordCircuitFailure(
  key: string,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
  automationId?: string
): Promise<void> {
  const existing = await prisma.automationCircuitBreaker.findUnique({ where: { key } });
  const nextFailureCount = (existing?.failureCount ?? 0) + 1;
  const shouldOpen = nextFailureCount >= config.failureThreshold;

  await prisma.automationCircuitBreaker.upsert({
    where: { key },
    update: {
      failureCount: nextFailureCount,
      lastFailureAt: new Date(),
      ...(shouldOpen ? { state: "OPEN" as const, openedAt: new Date(), resetAt: new Date(Date.now() + config.resetTimeoutMs) } : {}),
    },
    create: {
      key,
      automationId,
      failureCount: nextFailureCount,
      lastFailureAt: new Date(),
      ...(shouldOpen ? { state: "OPEN" as const, openedAt: new Date(), resetAt: new Date(Date.now() + config.resetTimeoutMs) } : {}),
    },
  });
}

export async function getCircuitBreakerState(key: string) {
  return prisma.automationCircuitBreaker.findUnique({ where: { key } });
}
