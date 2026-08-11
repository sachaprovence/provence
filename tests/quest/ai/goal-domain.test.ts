import { describe, expect, it } from "vitest";
import { firstNumber, growthSteps, reductionSteps, formatMinutes } from "@/lib/quest/ai/goal-domain";
import { detectDomainHandler } from "@/lib/quest/ai/domains/registry";

describe("Personal Quest AI — goal-domain utils", () => {
  it("firstNumber extrait le premier nombre, virgule ou point", () => {
    expect(firstNumber("Courir 1h à 10 km/h")).toBe(1);
    expect(firstNumber("50 pompes")).toBe(50);
    expect(firstNumber("environ 12,5 minutes")).toBe(12.5);
    expect(firstNumber("aucun nombre ici")).toBeNull();
  });

  it("growthSteps termine toujours exactement sur la cible", () => {
    const steps = growthSteps(5, 60);
    expect(steps[steps.length - 1]).toBe(60);
    expect(steps[0]).toBe(5);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.length).toBeLessThanOrEqual(7);
    // strictement croissant
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it("growthSteps gère current >= target sans planter", () => {
    expect(growthSteps(60, 30)).toEqual([30]);
  });

  it("reductionSteps termine toujours à 0", () => {
    const steps = reductionSteps(10);
    expect(steps[steps.length - 1]).toBe(0);
    expect(steps[0]).toBe(10);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it("formatMinutes accorde correctement le pluriel", () => {
    expect(formatMinutes(1)).toBe("1 minute");
    expect(formatMinutes(5)).toBe("5 minutes");
  });
});

describe("Personal Quest AI — détection de domaine sur les 7 objectifs de référence", () => {
  const cases: [string, string | null][] = [
    ["Courir 1h à 10 km/h", "RUNNING"],
    ["Faire 50 pompes", "STRENGTH"],
    ["Créer mon entreprise", "BUSINESS"],
    ["Trouver 10 clients", "SALES"],
    ["Apprendre l'anglais", "LANGUAGE"],
    ["Économiser 5000 €", "SAVINGS"],
    ["Arrêter de fumer", "QUIT_HABIT"],
  ];

  it.each(cases)("« %s » est reconnu comme %s", (title, expectedDomain) => {
    const handler = detectDomainHandler(title, null);
    expect(handler?.domain).toBe(expectedDomain);
  });

  it("un objectif réellement vague n'est reconnu par aucun domaine", () => {
    expect(detectDomainHandler("Être plus heureux", null)).toBeNull();
    expect(detectDomainHandler("Mieux organiser ma vie", null)).toBeNull();
  });
});
