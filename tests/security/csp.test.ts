import { describe, expect, it } from "vitest";
import { buildCspHeader } from "@/lib/security/csp";

/**
 * Content-Security-Policy par nonce (v1.3, AR-0173) — générée par requête
 * dans `src/proxy.ts`. Voir `tests/security/http-headers.test.ts` pour les
 * en-têtes statiques posés par `next.config.ts`.
 */
describe("buildCspHeader (AR-0173)", () => {
  it("inclut le nonce fourni dans script-src et style-src en production", () => {
    const csp = buildCspHeader("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-abc123'");
  });

  it("n'autorise jamais 'unsafe-inline' pour les scripts, ni en dev ni en prod", () => {
    expect(buildCspHeader("n1", true)).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(buildCspHeader("n2", false)).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("autorise unsafe-eval et unsafe-inline (styles) UNIQUEMENT en développement (React/Fast Refresh)", () => {
    const dev = buildCspHeader("n1", true);
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("style-src 'self' 'unsafe-inline'");

    const prod = buildCspHeader("n1", false);
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toContain("unsafe-inline");
  });

  it("ajoute upgrade-insecure-requests uniquement en production", () => {
    expect(buildCspHeader("n1", false)).toContain("upgrade-insecure-requests");
    expect(buildCspHeader("n1", true)).not.toContain("upgrade-insecure-requests");
  });

  it("bloque objets/plugins, iframes de tiers, et restreint base/formulaire au même site", () => {
    const csp = buildCspHeader("n1", false);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'self'");
  });

  it("autorise les images en blob/data (aperçus/QR codes générés côté client) mais rien d'externe", () => {
    const csp = buildCspHeader("n1", false);
    expect(csp).toContain("img-src 'self' blob: data:");
  });

  it("génère une valeur différente pour chaque nonce (jamais réutilisable entre requêtes)", () => {
    expect(buildCspHeader("nonce-a", false)).not.toBe(buildCspHeader("nonce-b", false));
  });
});
