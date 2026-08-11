import "server-only";
import type { QuestType } from "@/generated/prisma/enums";

/**
 * Reconnaissance de domaine (§ demande "Game Master intelligent", suite au
 * retour terrain sur des quêtes trop génériques) — permet au moteur
 * déterministe (mode démo, aucun appel IA) de produire des quêtes
 * réellement spécifiques à l'objectif plutôt que des gabarits interchangeables
 * ("Écris en une phrase ce que représente ton objectif" etc., désormais
 * interdits). Le mode IA réel (`AI_PROVIDER=anthropic`) reçoit aussi ce
 * domaine comme indice dans le prompt (voir `client.ts`), mais n'en dépend
 * pas : Claude comprend déjà "courir 1h à 10 km/h" nativement. Ce module
 * sert avant tout de filet de sécurité déterministe et de moteur de contenu
 * pour le mode démo.
 *
 * Principe central (demande explicite) : ne JAMAIS poser de question quand
 * on a déjà assez d'information pour agir. Chaque `DomainHandler` décide
 * lui-même si le niveau actuel de l'utilisateur change réellement la
 * première action (ex. course à pied, pompes, anglais, cigarettes/jour,
 * épargne mensuelle -> oui) ou non (ex. définir son client idéal, construire
 * une liste de prospects -> l'action a du sens quel que soit le niveau).
 */

export type GoalDomain = "RUNNING" | "STRENGTH" | "BUSINESS" | "SALES" | "LANGUAGE" | "SAVINGS" | "QUIT_HABIT" | "GENERIC";

export type DomainMilestoneDraft = { title: string; description: string | null; weight: number };

export type DomainQuestDraft = {
  title: string;
  description: string | null;
  why: string | null;
  type: QuestType;
  estimatedMinutes: number;
  difficulty: number;
  impactWeight: number;
};

export type DomainGoalContext = {
  title: string;
  description: string | null;
  /**
   * Texte déjà stocké sur l'objectif (`QuestGoal.currentState`), produit par
   * `parseLevelAnswer` de CE MÊME domaine lors de l'analyse — gabarité (pas
   * le texte libre de l'utilisateur), donc reparsable de façon fiable à
   * chaque étape (planification, génération de quêtes) sans avoir à faire
   * transiter l'information ailleurs dans le schéma.
   */
  currentStateText: string | null;
};

export interface DomainHandler {
  readonly domain: GoalDomain;
  matches(title: string, description: string | null): boolean;
  /** Vrai si on peut déjà agir sans poser de question (niveau connu, ou action pertinente quel que soit le niveau). */
  hasEnoughInfo(title: string, description: string | null, currentStateText: string | null): boolean;
  /** Question unique et ciblée sur le niveau actuel (jamais plus d'une par domaine reconnu). */
  levelQuestion(title: string, description: string | null): string;
  /** Convertit la réponse libre en une phrase d'état gabarité et reparsable (voir `DomainGoalContext.currentStateText`). */
  parseLevelAnswer(title: string, description: string | null, rawAnswer: string): string;
  buildMilestones(ctx: DomainGoalContext): DomainMilestoneDraft[];
  buildQuestsForMilestone(ctx: DomainGoalContext, milestone: { title: string; order: number }, count: number): DomainQuestDraft[];
  /** Ajuste une quête existante à partir de son propre titre (gabarité, donc reparsable) — jamais du texte libre utilisateur. */
  adjustQuest(previousQuestTitle: string, direction: "EASIER" | "HARDER"): DomainQuestDraft;
}

export function firstNumber(text: string): number | null {
  const match = text.match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return parseFloat(match[0].replace(",", "."));
}

/**
 * Suite de paliers croissants entre `current` et `target` (croissance ×1.6,
 * jamais plus de 6 paliers intermédiaires) — utilisée par les domaines à
 * progression numérique (course à pied, musculation, épargne). Le dernier
 * palier est toujours exactement `target`.
 */
export function growthSteps(current: number, target: number, maxSteps = 6): number[] {
  if (current >= target) return [Math.round(target)];
  const steps: number[] = [];
  let n = Math.max(1, current);
  while (n < target && steps.length < maxSteps) {
    steps.push(Math.round(n));
    n *= 1.6;
  }
  if (steps[steps.length - 1] !== Math.round(target)) steps.push(Math.round(target));
  return dedupeAdjacent(steps);
}

/** Suite de paliers décroissants de `current` vers 0 (décroissance ×0.6) — utilisée pour les habitudes à réduire (tabac). */
export function reductionSteps(current: number, maxSteps = 5): number[] {
  if (current <= 0) return [0];
  const steps: number[] = [];
  let n = current;
  while (n > 0 && steps.length < maxSteps) {
    steps.push(Math.round(n));
    n *= 0.6;
  }
  if (steps[steps.length - 1] !== 0) steps.push(0);
  return dedupeAdjacent(steps);
}

function dedupeAdjacent(values: number[]): number[] {
  const result: number[] = [];
  for (const v of values) {
    if (result.length === 0 || result[result.length - 1] !== v) result.push(v);
  }
  return result;
}

export function formatMinutes(n: number): string {
  const rounded = Math.round(n);
  return `${rounded} minute${rounded > 1 ? "s" : ""}`;
}
