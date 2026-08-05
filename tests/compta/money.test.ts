import { describe, expect, it } from "vitest";
import { extractVatFromTtc, formatEuros } from "@/lib/compta/money";

describe("Compta Vellano — extractVatFromTtc", () => {
  it("extrait la TVA d'un montant TTC (10 %, restauration sur place)", () => {
    // 9,50 € TTC à 10 % -> HT = 8,6363..., TVA = 0,8636... arrondi à 0,86 €.
    expect(extractVatFromTtc(950, 10)).toBe(86);
  });

  it("extrait la TVA d'un montant TTC (20 %, taux normal)", () => {
    // 25,00 € TTC à 20 % -> TVA = 25 × 20 / 120 = 4,1666... arrondi à 4,17 €.
    expect(extractVatFromTtc(2500, 20)).toBe(417);
  });

  it("renvoie 0 pour un taux de TVA nul", () => {
    expect(extractVatFromTtc(1000, 0)).toBe(0);
  });
});

describe("Compta Vellano — formatEuros", () => {
  it("formate des centimes en euros (fr-FR)", () => {
    // `toLocaleString` insère une espace insécable (U+00A0) avant le symbole — on
    // ne fige pas ce détail d'encodage, seulement le format visible.
    expect(formatEuros(950)).toMatch(/^9,50\s€$/);
    expect(formatEuros(0)).toMatch(/^0,00\s€$/);
    expect(formatEuros(-331)).toMatch(/^-3,31\s€$/);
  });
});
