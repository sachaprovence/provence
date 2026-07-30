import { describe, expect, it, beforeAll } from "vitest";
import {
  computeScore,
  registerBuiltInScoringFactors,
  registerScoringFactor,
  listScoringFactors,
  type ScoringFactor,
} from "@/lib/agents/commercial/scoring-engine";

/**
 * Moteur de scoring commercial (v0.5) — pas besoin de base de données
 * (calcul pur en mémoire). Teste les 9 facteurs par défaut, l'extensibilité
 * du registre, et les bornes du score final.
 */
describe("moteur de scoring commercial", () => {
  beforeAll(() => {
    registerBuiltInScoringFactors();
  });

  it("calcule un score nul pour un prospect sans aucune information", () => {
    const { total, breakdown } = computeScore({});
    expect(total).toBe(0);
    expect(breakdown.every((r) => r.points === 0)).toBe(true);
  });

  it("prend en compte la taille de l'entreprise, le secteur, la présence web et la qualité du site", () => {
    const { total, breakdown } = computeScore({
      companySize: "250+",
      sector: "technologie",
      website: "https://example.com",
    });
    expect(total).toBe(15 + 10 + 10 + 10); // company_size + sector (forte valeur) + web_presence + site_quality
    expect(breakdown.find((r) => r.key === "company_size")?.points).toBe(15);
    expect(breakdown.find((r) => r.key === "sector")?.points).toBe(10);
  });

  it("prend en compte la présence Google, la présence réseaux sociaux, l'historique, le potentiel et la probabilité de conversion", () => {
    const { total } = computeScore({
      googlePresenceScore: 100,
      socialPresenceCount: 4,
      previousInteractionsCount: 3,
      potentialEstimateValue: 6000,
      conversionProbabilityHint: 1,
    });
    expect(total).toBe(15 + 10 + 10 + 10 + 10); // google + social + history + potential + conversion
  });

  it("plafonne toujours le score final entre 0 et 100", () => {
    const { total } = computeScore({
      companySize: "250+",
      sector: "technologie",
      website: "https://example.com",
      googlePresenceScore: 100,
      socialPresenceCount: 10,
      previousInteractionsCount: 10,
      potentialEstimateValue: 100000,
      conversionProbabilityHint: 1,
    });
    expect(total).toBeLessThanOrEqual(100);
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it("est extensible : un nouveau facteur enregistré est immédiatement pris en compte, sans modifier computeScore", () => {
    const before = listScoringFactors().length;
    const customFactor: ScoringFactor = {
      key: "test_custom_bonus",
      label: "Bonus de test",
      maxPoints: 5,
      evaluate: () => ({ key: "test_custom_bonus", label: "Bonus de test", points: 5, maxPoints: 5, rationale: "toujours 5" }),
    };
    registerScoringFactor(customFactor);
    expect(listScoringFactors().length).toBe(before + 1);

    const { breakdown } = computeScore({});
    expect(breakdown.some((r) => r.key === "test_custom_bonus" && r.points === 5)).toBe(true);
  });
});
