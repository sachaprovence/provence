import { describe, expect, it } from "vitest";
import { evaluateProvider, renderMarkdown, type ProviderEvidence } from "../../scripts/lib/integration-validation";
import type { IntegrationDiagnosticProvider } from "../../src/lib/diagnostics/types";

/**
 * Logique de preuve de validation des intégrations (v1.3, AR-0172) — testée
 * contre des fournisseurs factices (jamais les vrais fournisseurs réseau) afin
 * de ne dépendre d'aucune variable d'environnement ni base de données. Le but
 * est de vérifier `evaluateProvider`/`renderMarkdown`, pas les fournisseurs
 * eux-mêmes (déjà testés dans `tests/diagnostics/providers/`).
 */
function fakeProvider(overrides: Partial<IntegrationDiagnosticProvider> = {}): IntegrationDiagnosticProvider {
  return {
    key: "STRIPE",
    label: "Fournisseur factice",
    getConfigState: async () => "NOT_CONFIGURED",
    testConnection: async () => {
      throw new Error("testConnection ne doit jamais être appelé si non CONFIGURED");
    },
    ...overrides,
  };
}

describe("evaluateProvider (AR-0172)", () => {
  it("ne tente jamais testConnection si NOT_CONFIGURED, et le signale honnêtement", async () => {
    const provider = fakeProvider({ getConfigState: async () => "NOT_CONFIGURED" });
    const result = await evaluateProvider(provider, "org-1");

    expect(result.configState).toBe("NOT_CONFIGURED");
    expect(result.test).toBeNull();
    expect(result.realAccountValidated).toBe(false);
    expect(result.note).toMatch(/Aucun identifiant fourni/);
  });

  it("ne tente jamais testConnection si PARTIALLY_CONFIGURED", async () => {
    const provider = fakeProvider({ getConfigState: async () => "PARTIALLY_CONFIGURED" });
    const result = await evaluateProvider(provider, "org-1");

    expect(result.configState).toBe("PARTIALLY_CONFIGURED");
    expect(result.test).toBeNull();
    expect(result.note).toMatch(/Configuration incomplète/);
  });

  it("appelle testConnection uniquement si CONFIGURED, et reflète son résultat réel", async () => {
    const provider = fakeProvider({
      getConfigState: async () => "CONFIGURED",
      testConnection: async () => ({ status: "TEST_SUCCESS", message: "ok" }),
    });
    const result = await evaluateProvider(provider, "org-1");

    expect(result.configState).toBe("CONFIGURED");
    expect(result.test).toEqual({ status: "TEST_SUCCESS", message: "ok" });
    expect(result.realAccountValidated).toBe(false);
    expect(result.note).toMatch(/N'A PAS été vérifié contre un compte de test officiel/);
  });

  it("propage un test échoué sans jamais marquer realAccountValidated à true", async () => {
    const provider = fakeProvider({
      getConfigState: async () => "CONFIGURED",
      testConnection: async () => ({ status: "TEST_FAILED", message: "connexion refusée" }),
    });
    const result = await evaluateProvider(provider, "org-1");

    expect(result.test).toEqual({ status: "TEST_FAILED", message: "connexion refusée" });
    expect(result.realAccountValidated).toBe(false);
  });
});

describe("renderMarkdown (AR-0172)", () => {
  const evidence: ProviderEvidence[] = [
    {
      key: "STRIPE",
      label: "Stripe (facturation)",
      configState: "NOT_CONFIGURED",
      configStateLabel: "non configurée",
      test: null,
      realAccountValidated: false,
      note: "Aucun identifiant fourni.",
    },
    {
      key: "S3_STORAGE",
      label: "Stockage S3",
      configState: "CONFIGURED",
      configStateLabel: "configurée",
      test: { status: "TEST_SUCCESS", message: "Connexion réussie" },
      realAccountValidated: false,
      note: "N'A PAS été vérifié contre un compte de test officiel.",
    },
  ];

  it("inclut un avertissement explicite qu'aucun compte réel n'a été validé", () => {
    const markdown = renderMarkdown(evidence, "org-1");
    expect(markdown).toMatch(/Aucune de ces intégrations n'a été validée contre un compte réel/);
  });

  it("inclut une ligne de tableau par intégration avec son état et son résultat de test", () => {
    const markdown = renderMarkdown(evidence, "org-1");
    expect(markdown).toContain("| Stripe (facturation) | non configurée | (non tenté) |");
    expect(markdown).toContain("| Stockage S3 | configurée | test réussi — Connexion réussie |");
  });

  it("inclut l'id d'organisation fourni", () => {
    const markdown = renderMarkdown(evidence, "org-reference-123");
    expect(markdown).toContain("org-reference-123");
  });
});
