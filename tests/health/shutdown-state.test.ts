import { afterEach, describe, expect, it } from "vitest";
import { isShuttingDown, markShuttingDown, resetShutdownStateForTests } from "@/lib/health/shutdown-state";

/** État d'arrêt en mémoire (v1.3, AR-0173) — voir tests/health/readiness.test.ts pour son effet sur /api/health/ready. */
describe("shutdown-state (AR-0173)", () => {
  afterEach(() => {
    resetShutdownStateForTests();
  });

  it("commence à false (pas d'arrêt en cours par défaut)", () => {
    expect(isShuttingDown()).toBe(false);
  });

  it("passe à true après markShuttingDown() et le reste", () => {
    markShuttingDown();
    expect(isShuttingDown()).toBe(true);
    expect(isShuttingDown()).toBe(true);
  });

  it("est irréversible en dehors des tests (jamais de retour à false autrement que resetShutdownStateForTests)", () => {
    markShuttingDown();
    markShuttingDown();
    expect(isShuttingDown()).toBe(true);
  });
});
