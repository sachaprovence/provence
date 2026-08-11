import "server-only";
import type { DomainHandler, DomainQuestDraft } from "../goal-domain";
import { firstNumber, growthSteps } from "../goal-domain";

/** Musculation au poids du corps (pompes, squats, tractions, abdos...) — progression par répétitions d'affilée. */

const EXERCISE_WORDS = ["pompes", "squats", "tractions", "abdominaux", "abdos", "burpees", "fentes", "dips"];
const LEVEL_REGEX = /faire\s+(\d+(?:[.,]\d+)?)\s+\S+\s+d'affilée/i;
const FREE_TEXT_LEVEL_REGEX = /(?:je\s+)?(?:fais|peux\s+faire|arrive\s+à\s+faire)[^.]{0,25}?(\d+(?:[.,]\d+)?)\s*(?:pompes|squats|tractions|abdos|répétitions)/i;

function extractExercise(text: string): string {
  const lower = text.toLowerCase();
  return EXERCISE_WORDS.find((w) => lower.includes(w)) ?? "répétitions";
}

function targetRepsFrom(title: string, description: string | null): number {
  return firstNumber(`${title} ${description ?? ""}`) ?? 20;
}

function currentRepsFrom(currentStateText: string | null, title: string, description: string | null): number | null {
  if (currentStateText) {
    const m = currentStateText.match(LEVEL_REGEX);
    if (m) return parseFloat(m[1].replace(",", "."));
  }
  const freeText = `${title} ${description ?? ""}`;
  const m = freeText.match(FREE_TEXT_LEVEL_REGEX);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function questForReps(n: number, exercise: string, target: number): DomainQuestDraft {
  const perSet = Math.max(1, Math.round(n / 3));
  const isTargetStage = n >= target;
  return {
    title: isTargetStage
      ? `Tente ${Math.round(n)} ${exercise} d'affilée, en une seule série, échauffement compris.`
      : `Fais 3 séries de ${perSet} ${exercise}, avec 90 secondes de repos entre chaque série.`,
    description: null,
    why: "Le volume total (séries × répétitions) construit la force nécessaire pour enchaîner plus de répétitions d'affilée.",
    type: perSet <= 5 ? "MICRO" : perSet <= 12 ? "SHORT" : "NORMAL",
    estimatedMinutes: 10 + perSet,
    difficulty: n / target <= 0.3 ? 1 : n / target <= 0.6 ? 2 : n / target <= 0.85 ? 3 : 4,
    impactWeight: isTargetStage ? 1.5 : 1,
  };
}

export const strengthDomain: DomainHandler = {
  domain: "STRENGTH",

  matches(title, description) {
    return new RegExp(`\\b(${EXERCISE_WORDS.join("|")})\\b`, "i").test(`${title} ${description ?? ""}`);
  },

  hasEnoughInfo(title, description, currentStateText) {
    return currentRepsFrom(currentStateText, title, description) !== null;
  },

  levelQuestion(title, description) {
    const exercise = extractExercise(`${title} ${description ?? ""}`);
    return `Combien de ${exercise} peux-tu faire d'affilée aujourd'hui, en une seule série ?`;
  },

  parseLevelAnswer(title, description, rawAnswer) {
    const exercise = extractExercise(`${title} ${description ?? ""}`);
    const reps = firstNumber(rawAnswer) ?? 5;
    return `Peut actuellement faire ${reps} ${exercise} d'affilée.`;
  },

  buildMilestones(ctx) {
    const exercise = extractExercise(`${ctx.title} ${ctx.description ?? ""}`);
    const target = targetRepsFrom(ctx.title, ctx.description);
    const current = currentRepsFrom(ctx.currentStateText, ctx.title, ctx.description) ?? 5;
    const steps = growthSteps(current, target);
    return steps.map((n, i) => ({
      title: `Faire ${n} ${exercise} d'affilée`,
      description: null,
      weight: Math.round((0.6 + i * 0.35) * 100) / 100,
    }));
  },

  buildQuestsForMilestone(ctx, milestone, count) {
    const exercise = extractExercise(milestone.title);
    const target = targetRepsFrom(ctx.title, ctx.description);
    const n = firstNumber(milestone.title) ?? 5;
    return [questForReps(n, exercise, target)].slice(0, Math.max(1, count));
  },

  adjustQuest(previousQuestTitle, direction) {
    const exercise = extractExercise(previousQuestTitle);
    const perSetMatch = previousQuestTitle.match(/séries de (\d+(?:[.,]\d+)?)/i);
    const currentPerSet = perSetMatch ? parseFloat(perSetMatch[1].replace(",", ".")) : (firstNumber(previousQuestTitle) ?? 5);

    if (direction === "HARDER") {
      const nextPerSet = Math.max(currentPerSet + 2, Math.round(currentPerSet * 1.4));
      return {
        title: `Fais 4 séries de ${nextPerSet} ${exercise}, avec 75 secondes de repos entre chaque série.`,
        description: null,
        why: "Plus de séries et plus de répétitions par série pour continuer à progresser.",
        type: nextPerSet <= 12 ? "SHORT" : "NORMAL",
        estimatedMinutes: 12 + nextPerSet,
        difficulty: 3,
        impactWeight: 1,
      };
    }

    const easierPerSet = Math.max(1, Math.round(currentPerSet * 0.6));
    return {
      title: `Fais 3 séries de ${easierPerSet} ${exercise}, avec 2 minutes de repos entre chaque série (les genoux au sol si besoin).`,
      description: null,
      why: "Réduire la charge par série tout en gardant le mouvement permet de continuer à progresser sans se bloquer.",
      type: "MICRO",
      estimatedMinutes: 10 + easierPerSet,
      difficulty: 1,
      impactWeight: 0.8,
    };
  },
};
