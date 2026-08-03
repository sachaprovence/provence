import { afterEach, describe, expect, it } from "vitest";
import { isRateLimited, clearRateLimitBuckets } from "@/lib/security/rate-limiter";

/**
 * Limiteur de débit best-effort par IP (v0.10, AR-0155) — protège les
 * endpoints d'authentification les plus sensibles contre un abus scripté
 * basique. Honnêteté documentée : en mémoire par processus, pas partagé
 * entre plusieurs instances (voir commentaire du module).
 */
describe("isRateLimited", () => {
  afterEach(() => {
    clearRateLimitBuckets();
  });

  it("autorise jusqu'à la limite puis bloque au-delà, sur la même fenêtre", () => {
    const key = "test-key-1";
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, 5, 60_000)).toBe(false);
    }
    expect(isRateLimited(key, 5, 60_000)).toBe(true);
    expect(isRateLimited(key, 5, 60_000)).toBe(true);
  });

  it("des clés différentes ont des compteurs indépendants", () => {
    for (let i = 0; i < 3; i++) expect(isRateLimited("key-a", 3, 60_000)).toBe(false);
    expect(isRateLimited("key-a", 3, 60_000)).toBe(true);
    expect(isRateLimited("key-b", 3, 60_000)).toBe(false);
  });

  it("réinitialise le compteur une fois la fenêtre expirée", () => {
    const key = "test-key-window";
    expect(isRateLimited(key, 1, 10)).toBe(false);
    expect(isRateLimited(key, 1, 10)).toBe(true);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(isRateLimited(key, 1, 10)).toBe(false);
        resolve();
      }, 20);
    });
  });
});
