import "server-only";
import type { DomainHandler, DomainQuestDraft } from "../goal-domain";
import { firstNumber, formatMinutes, growthSteps } from "../goal-domain";

/**
 * Course à pied — exemple de référence de la demande ("Courir 1h à 10 km/h").
 * Progression par durée courue sans s'arrêter, cible finale = durée + allure
 * si précisées dans l'objectif.
 */

const LEVEL_REGEX = /courir\s+(\d+(?:[.,]\d+)?)\s*minutes?\s+sans\s+s'arrêter/i;
const FREE_TEXT_LEVEL_REGEX = /(?:je\s+)?(?:cours|courir|peux\s+courir|court)[^.]{0,25}?(\d+(?:[.,]\d+)?)\s*min/i;

function parseDurationMinutes(text: string): number | null {
  let minutes = 0;
  let found = false;
  const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*h(?:eure)?s?\b/i);
  if (hourMatch) {
    minutes += parseFloat(hourMatch[1].replace(",", ".")) * 60;
    found = true;
  }
  const minMatch = text.match(/(\d+(?:[.,]\d+)?)\s*min(?:utes?)?\b/i);
  if (minMatch) {
    minutes += parseFloat(minMatch[1].replace(",", "."));
    found = true;
  }
  return found ? minutes : null;
}

function parsePaceKmh(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*km\s*\/?\s*h/i);
  return match ? parseFloat(match[1].replace(",", ".")) : null;
}

function targetFrom(title: string, description: string | null): { duration: number; pace: number | null } {
  const text = `${title} ${description ?? ""}`;
  return { duration: parseDurationMinutes(text) ?? 30, pace: parsePaceKmh(text) };
}

function currentMinutesFrom(currentStateText: string | null, title: string, description: string | null): number | null {
  if (currentStateText) {
    const m = currentStateText.match(LEVEL_REGEX);
    if (m) return parseFloat(m[1].replace(",", "."));
  }
  const freeText = `${title} ${description ?? ""}`;
  const m = freeText.match(FREE_TEXT_LEVEL_REGEX);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function difficultyFromMinutes(n: number, target: number): number {
  const ratio = n / target;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.65) return 3;
  if (ratio <= 0.9) return 4;
  return 5;
}

function questForDuration(n: number, target: number, pace: number | null): DomainQuestDraft {
  const isTargetStage = n >= target;
  const title =
    isTargetStage && pace
      ? `Cours ${formatMinutes(n)} à l'allure qui te permet de tenir ${pace} km/h, sans t'arrêter.`
      : `Cours ${formatMinutes(n)} à allure confortable, sans t'arrêter.`;
  return {
    title,
    description: null,
    why: "Le seul moyen de courir plus longtemps est de courir régulièrement à une durée qui te met légèrement au défi, sans t'épuiser.",
    type: n <= 8 ? "MICRO" : n <= 20 ? "SHORT" : n <= 40 ? "NORMAL" : "DEEP",
    estimatedMinutes: Math.ceil(n) + 5,
    difficulty: difficultyFromMinutes(n, target),
    impactWeight: isTargetStage ? 1.5 : 1,
  };
}

export const runningDomain: DomainHandler = {
  domain: "RUNNING",

  matches(title, description) {
    return /courir|course\s*à\s*pied|jogging|running/i.test(`${title} ${description ?? ""}`);
  },

  hasEnoughInfo(title, description, currentStateText) {
    return currentMinutesFrom(currentStateText, title, description) !== null;
  },

  levelQuestion() {
    return "Combien de temps peux-tu courir actuellement sans t'arrêter, à allure confortable ?";
  },

  parseLevelAnswer(_title, _description, rawAnswer) {
    const minutes = firstNumber(rawAnswer) ?? 5;
    return `Peut actuellement courir ${formatMinutes(minutes)} sans s'arrêter.`;
  },

  buildMilestones(ctx) {
    const { duration: target, pace } = targetFrom(ctx.title, ctx.description);
    const current = currentMinutesFrom(ctx.currentStateText, ctx.title, ctx.description) ?? 5;
    const steps = growthSteps(current, target);
    return steps.map((n, i) => ({
      title: n >= target && pace ? `Courir ${formatMinutes(target)} à ${pace} km/h sans s'arrêter` : `Courir ${formatMinutes(n)} sans s'arrêter`,
      description: null,
      weight: Math.round((0.6 + i * 0.35) * 100) / 100,
    }));
  },

  buildQuestsForMilestone(ctx, milestone, count) {
    const { duration: target, pace } = targetFrom(ctx.title, ctx.description);
    const n = firstNumber(milestone.title) ?? 5;
    return [questForDuration(n, target, pace)].slice(0, Math.max(1, count));
  },

  adjustQuest(previousQuestTitle, direction) {
    const n = firstNumber(previousQuestTitle) ?? 5;
    if (direction === "HARDER") {
      const next = Math.max(n + 1, Math.round(n * 1.6));
      return questForDuration(next, next, null);
    }
    const reps = Math.min(8, Math.max(4, Math.round(n)));
    return {
      title: `Fais ${reps} x (1 minute de course + 1 minute de marche), pour un total de ${reps * 2} minutes.`,
      description: null,
      why: "Alterner course et marche permet d'avancer même quand courir en continu est trop difficile aujourd'hui.",
      type: "SHORT",
      estimatedMinutes: reps * 2 + 5,
      difficulty: 1,
      impactWeight: 0.8,
    };
  },
};
