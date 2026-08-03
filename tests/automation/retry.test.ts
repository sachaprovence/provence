import { describe, expect, it } from "vitest";
import { decideRetry, type RetryPolicy } from "@/lib/automation/retry/retry-engine";
import { isCircuitOpen, recordCircuitFailure, recordCircuitSuccess, getCircuitBreakerState } from "@/lib/automation/retry/circuit-breaker";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describe("Retry Engine — decideRetry", () => {
  const firstAttemptAt = new Date("2026-01-01T00:00:00Z");
  const error = { message: "boom" };

  it("immediate : aucun délai, plafonné par maxAttempts (défaut 3)", () => {
    const policy: RetryPolicy = { strategy: "immediate" };
    expect(decideRetry({ policy, attempt: 1, error, firstAttemptAt })).toEqual({ shouldRetry: true, delayMs: 0 });
    expect(decideRetry({ policy, attempt: 3, error, firstAttemptAt })).toEqual({ shouldRetry: false, delayMs: 0 });
  });

  it("linear : le délai croît proportionnellement à la tentative", () => {
    const policy: RetryPolicy = { strategy: "linear", baseDelayMs: 1000, maxAttempts: 10 };
    expect(decideRetry({ policy, attempt: 1, error, firstAttemptAt }).delayMs).toBe(1000);
    expect(decideRetry({ policy, attempt: 3, error, firstAttemptAt }).delayMs).toBe(3000);
  });

  it("exponential : le délai double à chaque tentative, plafonné par maxDelayMs", () => {
    const policy: RetryPolicy = { strategy: "exponential", baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 10 };
    expect(decideRetry({ policy, attempt: 1, error, firstAttemptAt }).delayMs).toBe(1000);
    expect(decideRetry({ policy, attempt: 2, error, firstAttemptAt }).delayMs).toBe(2000);
    expect(decideRetry({ policy, attempt: 3, error, firstAttemptAt }).delayMs).toBe(4000);
    expect(decideRetry({ policy, attempt: 4, error, firstAttemptAt }).delayMs).toBe(5000); // plafonné
  });

  it("manual : ne retente jamais automatiquement", () => {
    const policy: RetryPolicy = { strategy: "manual" };
    expect(decideRetry({ policy, attempt: 1, error, firstAttemptAt })).toEqual({ shouldRetry: false, delayMs: 0 });
  });

  it("limited : exige maxAttempts, plafonne strictement", () => {
    expect(() => decideRetry({ policy: { strategy: "limited" }, attempt: 1, error, firstAttemptAt })).toThrow(/maxAttempts/);
    const policy: RetryPolicy = { strategy: "limited", maxAttempts: 2 };
    expect(decideRetry({ policy, attempt: 1, error, firstAttemptAt }).shouldRetry).toBe(true);
    expect(decideRetry({ policy, attempt: 2, error, firstAttemptAt }).shouldRetry).toBe(false);
  });

  it("infinite : retente toujours, sauf si maxDurationMs est dépassé", () => {
    const policy: RetryPolicy = { strategy: "infinite", maxDurationMs: 60_000 };
    const withinDuration = decideRetry({ policy, attempt: 50, error, firstAttemptAt, now: new Date(firstAttemptAt.getTime() + 30_000) });
    expect(withinDuration.shouldRetry).toBe(true);
    const pastDuration = decideRetry({ policy, attempt: 50, error, firstAttemptAt, now: new Date(firstAttemptAt.getTime() + 90_000) });
    expect(pastDuration.shouldRetry).toBe(false);
  });

  it("conditional : ne retente que si la règle s'évalue à vrai contre l'erreur", () => {
    const policy: RetryPolicy = {
      strategy: "conditional",
      conditionRule: { op: "regex", value: { kind: "var", path: "context.error.message" }, pattern: "timeout" },
      maxAttempts: 5,
    };
    expect(decideRetry({ policy, attempt: 1, error: { message: "network timeout" }, firstAttemptAt }).shouldRetry).toBe(true);
    expect(decideRetry({ policy, attempt: 1, error: { message: "validation failed" }, firstAttemptAt }).shouldRetry).toBe(false);
  });
});

runIfDatabase("Circuit Breaker", () => {
  it("reste fermé sous le seuil, s'ouvre au seuil, bloque pendant la fenêtre de réinitialisation", async () => {
    const key = `test-circuit-${Date.now()}`;
    const config = { failureThreshold: 3, resetTimeoutMs: 100_000 };

    expect(await isCircuitOpen(key)).toBe(false);

    await recordCircuitFailure(key, config);
    await recordCircuitFailure(key, config);
    expect(await isCircuitOpen(key)).toBe(false); // sous le seuil

    await recordCircuitFailure(key, config);
    expect(await isCircuitOpen(key)).toBe(true); // seuil atteint

    const state = await getCircuitBreakerState(key);
    expect(state?.state).toBe("OPEN");
    expect(state?.failureCount).toBe(3);
  });

  it("passe en HALF_OPEN puis se referme après un succès une fois la fenêtre écoulée", async () => {
    const key = `test-circuit-half-open-${Date.now()}`;
    await recordCircuitFailure(key, { failureThreshold: 1, resetTimeoutMs: -1 }); // fenêtre déjà écoulée

    expect(await isCircuitOpen(key)).toBe(false); // transition OPEN -> HALF_OPEN, laisse passer
    await recordCircuitSuccess(key);

    const state = await getCircuitBreakerState(key);
    expect(state?.state).toBe("CLOSED");
    expect(state?.failureCount).toBe(0);
  });
});
