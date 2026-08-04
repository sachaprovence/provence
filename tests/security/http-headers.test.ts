import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * En-têtes de sécurité HTTP (v1.2, AR-0169) — `next.config.ts#headers()`
 * est une simple fonction async exportée par la config Next.js : testable
 * directement sans serveur réel, contrairement à un test qui nécessiterait
 * de démarrer `next start` (déjà vérifié manuellement une fois pendant le
 * développement contre un vrai serveur de production, voir le commit).
 */
describe("next.config.ts — en-têtes de sécurité HTTP (AR-0169)", () => {
  it("désactive l'en-tête X-Powered-By (ne révèle pas la pile technique)", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applique les en-têtes de sécurité à toutes les routes", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");

    const headerMap = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
    expect(headerMap["X-Frame-Options"]).toBe("DENY");
    expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headerMap["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(headerMap["Permissions-Policy"]).toBeDefined();
  });

  it("ne définit délibérément aucune Content-Security-Policy (voir ADR 0045 pour la justification)", async () => {
    const rules = await nextConfig.headers!();
    const headerMap = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(headerMap["Content-Security-Policy"]).toBeUndefined();
  });
});
