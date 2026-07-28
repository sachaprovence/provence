import { describe, expect, it } from "vitest";
import { computeScore, DEFAULT_SCORING_RULES } from "@/lib/scoring";

const baseCtx = {
  establishmentName: "Villa Provence",
  category: "VILLA",
  hasVirtualTour: false,
  reviewCount: 60,
  averageRating: 4.2,
  websiteUrl: "https://example.com",
  socialLinks: { instagram: "https://instagram.com/x" },
  address: "1 rue des Lavandes, Avignon",
  inZone: true,
  isSuppressed: false,
} as const;

describe("computeScore", () => {
  it("cumule les points des règles activées", () => {
    const result = computeScore(baseCtx);
    // premium(20) + no-tour(15) + many-reviews(10) + weak-website(10) + in-zone(10) + active-social(5) + medium-photos(5)
    expect(result.value).toBe(75);
    expect(result.category).toBe("prospect_interessant");
  });

  it("plafonne à 100 et catégorise en priorité immédiate", () => {
    const ctx = { ...baseCtx, category: "AIRBNB_HOST" as const, reviewCount: 80 };
    const result = computeScore(ctx);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(["priorite_immediate", "prospect_interessant"]).toContain(result.category);
  });

  it("un prospect désinscrit tombe à 0 (plancher)", () => {
    const ctx = { ...baseCtx, isSuppressed: true };
    const result = computeScore(ctx);
    expect(result.value).toBe(0);
    expect(result.category).toBe("faible_priorite");
  });

  it("un établissement fermé perd des points", () => {
    const withoutClosed = computeScore(baseCtx);
    const withClosed = computeScore({ ...baseCtx, closedBusiness: true });
    expect(withClosed.value).toBeLessThan(withoutClosed.value);
  });

  it("une règle désactivée n'est pas appliquée", () => {
    const rules = DEFAULT_SCORING_RULES.map((r) => (r.id === "premium" ? { ...r, enabled: false } : r));
    const result = computeScore(baseCtx, rules);
    expect(result.breakdown.find((b) => b.ruleId === "premium")).toBeUndefined();
  });
});
