import { describe, expect, it } from "vitest";
import { scanContent } from "../../scripts/lib/secret-scan";

/**
 * Scan de secrets (v1.3, AR-0176) — voir `scripts/scan-secrets.ts` pour le
 * point d'entrée CLI (analyse `git ls-files`, jamais l'historique complet).
 */
describe("scanContent (AR-0176)", () => {
  it("détecte une clé d'accès AWS (haute confiance)", () => {
    const findings = scanContent("src/config.ts", `const key = "AKIAIOSFODNN7EXAMPLE";`);
    expect(findings).toHaveLength(1);
    expect(findings[0].highConfidence).toBe(true);
    expect(findings[0].patternName).toContain("AWS");
  });

  it("détecte une clé privée PEM (haute confiance)", () => {
    const findings = scanContent("id_rsa", "-----BEGIN RSA PRIVATE KEY-----");
    expect(findings).toHaveLength(1);
    expect(findings[0].highConfidence).toBe(true);
  });

  it("détecte une clé Stripe live (haute confiance)", () => {
    const findings = scanContent("src/billing.ts", `const key = "sk_live_${"a".repeat(24)}";`);
    expect(findings.some((f) => f.patternName.includes("Stripe"))).toBe(true);
  });

  it("détecte un littéral générique assigné à un champ sensible en dehors des tests", () => {
    const findings = scanContent("src/app/api/foo/route.ts", `const config = { password: "un-vrai-mot-de-passe-oublie" };`);
    expect(findings).toHaveLength(1);
    expect(findings[0].highConfidence).toBe(false);
  });

  it("ignore la détection générique dans les fichiers de test (identifiants fictifs attendus)", () => {
    const findings = scanContent("tests/auth/login.test.ts", `const password = "password1234";`);
    expect(findings).toHaveLength(0);
  });

  it("continue de détecter les formats haute confiance même dans un fichier de test", () => {
    const findings = scanContent("tests/some.test.ts", `const key = "AKIAIOSFODNN7EXAMPLE";`);
    expect(findings).toHaveLength(1);
    expect(findings[0].highConfidence).toBe(true);
  });

  it("exclut les valeurs explicitement sûres (process.env, placeholders documentés)", () => {
    const findings = scanContent("src/config.ts", `const secret = process.env.MY_SECRET;`);
    expect(findings).toHaveLength(0);
  });

  it("ne trouve rien dans du code sans aucun secret", () => {
    const findings = scanContent("src/utils.ts", `export function add(a: number, b: number) { return a + b; }`);
    expect(findings).toHaveLength(0);
  });
});
