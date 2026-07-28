import type { LeadFactsInput } from "@/lib/ai/types";

export type ScoringCondition =
  | "PREMIUM_CATEGORY"
  | "MULTI_UNIT"
  | "NO_VIRTUAL_TOUR"
  | "MANY_REVIEWS"
  | "ACTIVE_BUT_NOT_IMMERSIVE_WEBSITE"
  | "STRONG_OTA_PRESENCE"
  | "IN_ZONE"
  | "ACTIVE_SOCIAL_MEDIA"
  | "MEDIUM_QUALITY_PHOTOS"
  | "NO_PROFESSIONAL_ADDRESS"
  | "CLOSED_BUSINESS"
  | "RECENTLY_CONTACTED"
  | "SUPPRESSED";

export type ScoringRule = {
  id: string;
  label: string;
  condition: ScoringCondition;
  points: number;
  enabled: boolean;
};

export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  { id: "premium", label: "Établissement haut de gamme", condition: "PREMIUM_CATEGORY", points: 20, enabled: true },
  { id: "multi-unit", label: "Plusieurs logements/établissements", condition: "MULTI_UNIT", points: 15, enabled: true },
  { id: "no-tour", label: "Aucune visite virtuelle visible", condition: "NO_VIRTUAL_TOUR", points: 15, enabled: true },
  { id: "many-reviews", label: "Beaucoup d'avis clients (≥ 50)", condition: "MANY_REVIEWS", points: 10, enabled: true },
  { id: "weak-website", label: "Site actif mais peu immersif", condition: "ACTIVE_BUT_NOT_IMMERSIVE_WEBSITE", points: 10, enabled: true },
  { id: "ota-presence", label: "Présence importante sur Airbnb/Booking", condition: "STRONG_OTA_PRESENCE", points: 10, enabled: true },
  { id: "in-zone", label: "Situé dans la zone d'intervention", condition: "IN_ZONE", points: 10, enabled: true },
  { id: "active-social", label: "Réseaux sociaux actifs", condition: "ACTIVE_SOCIAL_MEDIA", points: 5, enabled: true },
  { id: "medium-photos", label: "Photos de qualité moyenne améliorables", condition: "MEDIUM_QUALITY_PHOTOS", points: 5, enabled: true },
  { id: "no-address", label: "Aucune adresse professionnelle disponible", condition: "NO_PROFESSIONAL_ADDRESS", points: -20, enabled: true },
  { id: "closed", label: "Établissement fermé", condition: "CLOSED_BUSINESS", points: -20, enabled: true },
  { id: "recent-contact", label: "Prospect déjà contacté récemment", condition: "RECENTLY_CONTACTED", points: -15, enabled: true },
  { id: "suppressed", label: "Prospect désinscrit / liste d'exclusion", condition: "SUPPRESSED", points: -100, enabled: true },
];

export type ScoringContext = LeadFactsInput & {
  address?: string | null;
  inZone: boolean;
  recentlyContactedDays?: number | null;
  isSuppressed: boolean;
};

export type ScoreBreakdownEntry = { ruleId: string; label: string; points: number };

export type ScoreResult = {
  value: number;
  category: "priorite_immediate" | "prospect_interessant" | "a_verifier" | "faible_priorite";
  breakdown: ScoreBreakdownEntry[];
};

function evaluateCondition(condition: ScoringCondition, ctx: ScoringContext): boolean {
  switch (condition) {
    case "PREMIUM_CATEGORY":
      return ctx.category === "VILLA" || ctx.category === "HOTEL";
    case "MULTI_UNIT":
      return ctx.category === "AIRBNB_HOST" || ctx.category === "CAMPING";
    case "NO_VIRTUAL_TOUR":
      return ctx.hasVirtualTour === false;
    case "MANY_REVIEWS":
      return (ctx.reviewCount ?? 0) >= 50;
    case "ACTIVE_BUT_NOT_IMMERSIVE_WEBSITE":
      return Boolean(ctx.websiteUrl) && ctx.hasVirtualTour !== true;
    case "STRONG_OTA_PRESENCE":
      return ctx.category === "AIRBNB_HOST" && (ctx.reviewCount ?? 0) >= 20;
    case "IN_ZONE":
      return ctx.inZone;
    case "ACTIVE_SOCIAL_MEDIA":
      return Boolean(ctx.socialLinks && Object.keys(ctx.socialLinks).length > 0);
    case "MEDIUM_QUALITY_PHOTOS":
      return Boolean(ctx.websiteUrl) && (ctx.averageRating ?? 0) < 4.5 && (ctx.averageRating ?? 0) > 0;
    case "NO_PROFESSIONAL_ADDRESS":
      return !ctx.address;
    case "CLOSED_BUSINESS":
      return Boolean(ctx.closedBusiness);
    case "RECENTLY_CONTACTED":
      return typeof ctx.recentlyContactedDays === "number" && ctx.recentlyContactedDays < 14;
    case "SUPPRESSED":
      return ctx.isSuppressed;
    default:
      return false;
  }
}

function categorize(value: number): ScoreResult["category"] {
  if (value >= 80) return "priorite_immediate";
  if (value >= 60) return "prospect_interessant";
  if (value >= 40) return "a_verifier";
  return "faible_priorite";
}

export function computeScore(ctx: ScoringContext, rules: ScoringRule[] = DEFAULT_SCORING_RULES): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let value = 0;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (evaluateCondition(rule.condition, ctx)) {
      value += rule.points;
      breakdown.push({ ruleId: rule.id, label: rule.label, points: rule.points });
    }
  }
  value = Math.max(0, Math.min(100, value));
  return { value, category: categorize(value), breakdown };
}

export const SCORE_CATEGORY_LABEL: Record<ScoreResult["category"], string> = {
  priorite_immediate: "Priorité immédiate",
  prospect_interessant: "Prospect intéressant",
  a_verifier: "À vérifier",
  faible_priorite: "Faible priorité",
};
