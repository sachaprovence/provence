import "server-only";

/**
 * Moteur de scoring commercial (v0.5) — registre de facteurs pondérés,
 * chacun **heuristique et déterministe** (pas d'appel IA), dans la
 * continuité de la position déjà prise pour la décomposition du Director
 * (ADR 0011) : honnête sur ce qu'il est réellement, mais fonctionnel et
 * testable. Extensible par construction : ajouter un facteur = appeler
 * `registerScoringFactor`, jamais modifier `computeScore`. Voir ADR 0014.
 */
export type ProspectFacts = {
  companySize?: string | null;
  sector?: string | null;
  website?: string | null;
  googlePresenceScore?: number | null;
  socialPresenceCount?: number | null;
  previousInteractionsCount?: number | null;
  potentialEstimateValue?: number | null;
  conversionProbabilityHint?: number | null;
};

export type ScoringFactorResult = {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  rationale: string;
};

export interface ScoringFactor {
  readonly key: string;
  readonly label: string;
  /** Poids du facteur, en points sur 100 — la somme des `maxPoints` de tous les facteurs enregistrés doit rester ≤ 100 pour que le score final reste sur 100. */
  readonly maxPoints: number;
  evaluate(facts: ProspectFacts): ScoringFactorResult;
}

const factors = new Map<string, ScoringFactor>();

export function registerScoringFactor(factor: ScoringFactor) {
  factors.set(factor.key, factor);
}

export function listScoringFactors(): ScoringFactor[] {
  return Array.from(factors.values());
}

export type ScoreResult = { total: number; breakdown: ScoringFactorResult[] };

export function computeScore(facts: ProspectFacts): ScoreResult {
  const breakdown = listScoringFactors().map((factor) => factor.evaluate(facts));
  const total = breakdown.reduce((sum, result) => sum + result.points, 0);
  return { total: Math.max(0, Math.min(100, Math.round(total))), breakdown };
}

const HIGH_VALUE_SECTORS = ["technologie", "finance", "immobilier", "hôtellerie", "santé", "industrie"];

const companySizeFactor: ScoringFactor = {
  key: "company_size",
  label: "Taille de l'entreprise",
  maxPoints: 15,
  evaluate(facts) {
    const points = { "250+": 15, "50-249": 12, "10-49": 8, "1-9": 4 }[facts.companySize ?? ""] ?? 0;
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale: facts.companySize ? `Taille déclarée : ${facts.companySize}.` : "Taille inconnue.",
    };
  },
};

const sectorFactor: ScoringFactor = {
  key: "sector",
  label: "Secteur d'activité",
  maxPoints: 10,
  evaluate(facts) {
    const normalized = facts.sector?.toLowerCase() ?? "";
    const isHighValue = HIGH_VALUE_SECTORS.some((sector) => normalized.includes(sector));
    const points = !facts.sector ? 0 : isHighValue ? 10 : 5;
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale: facts.sector
        ? `Secteur "${facts.sector}"${isHighValue ? " (à forte valeur)" : ""}.`
        : "Secteur inconnu.",
    };
  },
};

const webPresenceFactor: ScoringFactor = {
  key: "web_presence",
  label: "Présence web",
  maxPoints: 10,
  evaluate(facts) {
    const points = facts.website ? 10 : 0;
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale: facts.website ? "Site web renseigné." : "Aucun site web renseigné.",
    };
  },
};

const siteQualityFactor: ScoringFactor = {
  key: "site_quality",
  label: "Qualité du site",
  maxPoints: 10,
  evaluate(facts) {
    let points = 0;
    let rationale = "Aucun site à évaluer.";
    if (facts.website?.startsWith("https://")) {
      points = 10;
      rationale = "Site en HTTPS.";
    } else if (facts.website?.startsWith("http://")) {
      points = 5;
      rationale = "Site en HTTP (non sécurisé) — heuristique basique, pas d'audit réel du contenu.";
    }
    return { key: this.key, label: this.label, points, maxPoints: this.maxPoints, rationale };
  },
};

const googlePresenceFactor: ScoringFactor = {
  key: "google_presence",
  label: "Présence Google",
  maxPoints: 15,
  evaluate(facts) {
    const score = facts.googlePresenceScore ?? 0;
    const points = Math.round((Math.max(0, Math.min(100, score)) / 100) * this.maxPoints);
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale:
        facts.googlePresenceScore != null
          ? `Signal de présence Google fourni : ${facts.googlePresenceScore}/100.`
          : "Aucun signal de présence Google fourni — non évalué (0 par défaut).",
    };
  },
};

const socialPresenceFactor: ScoringFactor = {
  key: "social_presence",
  label: "Présence réseaux sociaux",
  maxPoints: 10,
  evaluate(facts) {
    const count = facts.socialPresenceCount ?? 0;
    const points = Math.min(this.maxPoints, count * 2.5);
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale: `${count} profil(s) réseau social connu(s).`,
    };
  },
};

const historyFactor: ScoringFactor = {
  key: "history",
  label: "Historique",
  maxPoints: 10,
  evaluate(facts) {
    const count = facts.previousInteractionsCount ?? 0;
    const points = count >= 3 ? 10 : count >= 1 ? 5 : 0;
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale: `${count} interaction(s) antérieure(s) connue(s).`,
    };
  },
};

const potentialFactor: ScoringFactor = {
  key: "potential",
  label: "Potentiel estimé",
  maxPoints: 10,
  evaluate(facts) {
    const value = facts.potentialEstimateValue ?? 0;
    const points = value >= 5000 ? 10 : value >= 1000 ? 6 : value > 0 ? 2 : 0;
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale: facts.potentialEstimateValue != null ? `Potentiel estimé : ${value}.` : "Potentiel non estimé.",
    };
  },
};

const conversionProbabilityFactor: ScoringFactor = {
  key: "conversion_probability",
  label: "Probabilité de conversion",
  maxPoints: 10,
  evaluate(facts) {
    const probability = Math.max(0, Math.min(1, facts.conversionProbabilityHint ?? 0));
    const points = Math.round(probability * this.maxPoints);
    return {
      key: this.key,
      label: this.label,
      points,
      maxPoints: this.maxPoints,
      rationale:
        facts.conversionProbabilityHint != null
          ? `Probabilité de conversion estimée : ${Math.round(probability * 100)}%.`
          : "Probabilité de conversion non estimée.",
    };
  },
};

let registered = false;

/** Enregistre les 9 facteurs par défaut (idempotent) — voir `bootstrap.ts`. */
export function registerBuiltInScoringFactors() {
  if (registered) return;
  registered = true;

  for (const factor of [
    companySizeFactor,
    sectorFactor,
    webPresenceFactor,
    siteQualityFactor,
    googlePresenceFactor,
    socialPresenceFactor,
    historyFactor,
    potentialFactor,
    conversionProbabilityFactor,
  ]) {
    registerScoringFactor(factor);
  }
}
