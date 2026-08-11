import "server-only";
import type { DomainHandler, DomainQuestDraft } from "../goal-domain";
import { firstNumber, reductionSteps } from "../goal-domain";

/** Arrêt d'une habitude (tabac...) — réduction progressive, jamais un sevrage brutal imposé d'un coup. */

const LEVEL_REGEX = /fume\s+actuellement\s+(\d+(?:[.,]\d+)?)\s*cigarettes?\s+par\s+jour/i;

function currentPerDayFrom(currentStateText: string | null): number | null {
  if (!currentStateText) return null;
  const m = currentStateText.match(LEVEL_REGEX);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

export const quitHabitDomain: DomainHandler = {
  domain: "QUIT_HABIT",

  matches(title, description) {
    return /arrêter\s+de\s+fumer|arrêter\s+la\s+cigarette|arrêter\s+le\s+tabac/i.test(`${title} ${description ?? ""}`);
  },

  hasEnoughInfo(_title, _description, currentStateText) {
    return currentPerDayFrom(currentStateText) !== null;
  },

  levelQuestion() {
    return "Combien de cigarettes fumes-tu par jour actuellement ?";
  },

  parseLevelAnswer(_title, _description, rawAnswer) {
    const perDay = firstNumber(rawAnswer) ?? 10;
    return `Fume actuellement ${Math.round(perDay)} cigarettes par jour.`;
  },

  buildMilestones(ctx) {
    const current = currentPerDayFrom(ctx.currentStateText) ?? 10;
    const steps = reductionSteps(current);
    return steps.map((k, i) => ({
      title: k > 0 ? `Ne pas dépasser ${k} cigarette${k > 1 ? "s" : ""} par jour` : i === steps.length - 1 ? "Tenir 7 jours sans fumer" : "Ne plus fumer du tout, une journée complète",
      description: null,
      weight: Math.round((0.6 + i * 0.4) * 100) / 100,
    }));
  },

  buildQuestsForMilestone(ctx, milestone, count) {
    const k = firstNumber(milestone.title);
    let quest: DomainQuestDraft;
    if (k !== null && k > 0) {
      quest = {
        title: `Aujourd'hui, ne dépasse pas ${k} cigarette${k > 1 ? "s" : ""}. Note l'heure et la raison à chaque envie, avant d'allumer ou non.`,
        description: null,
        why: "Noter chaque envie avant d'agir crée un espace de choix là où le geste était jusqu'ici automatique.",
        type: "SHORT",
        estimatedMinutes: 5,
        difficulty: Math.max(1, Math.min(4, Math.round((currentPerDayFrom(ctx.currentStateText) ?? 10) / Math.max(1, k)))),
        impactWeight: 1,
      };
    } else if (/7 jours/i.test(milestone.title)) {
      quest = {
        title: "Tiens un journal quotidien de tes envies pendant 7 jours sans fumer, et note ce qui t'aide le plus à chaque fois.",
        description: null,
        why: "Identifier ce qui fonctionne vraiment pour toi rend la suite plus fiable qu'une méthode générique.",
        type: "HABIT",
        estimatedMinutes: 10,
        difficulty: 3,
        impactWeight: 1.8,
      };
    } else {
      quest = {
        title: "Passe une journée complète sans fumer. Prépare à l'avance 3 alternatives concrètes (chewing-gum, marche de 5 minutes, respiration profonde) pour les moments difficiles.",
        description: null,
        why: "Préparer des alternatives à l'avance évite de devoir improviser au moment où l'envie est la plus forte.",
        type: "CHALLENGE",
        estimatedMinutes: 10,
        difficulty: 4,
        impactWeight: 1.6,
      };
    }
    return [quest].slice(0, Math.max(1, count));
  },

  adjustQuest(previousQuestTitle, direction) {
    const k = firstNumber(previousQuestTitle);
    if (direction === "HARDER") {
      const next = k !== null ? Math.max(0, Math.round(k * 0.6)) : 0;
      return {
        title: next > 0
          ? `Aujourd'hui, ne dépasse pas ${next} cigarette${next > 1 ? "s" : ""}. Note l'heure et la raison à chaque envie.`
          : "Passe une journée complète sans fumer, avec 3 alternatives préparées à l'avance.",
        description: null,
        why: "Réduire davantage maintenant que le rythme précédent était tenu sans difficulté.",
        type: "SHORT",
        estimatedMinutes: 5,
        difficulty: 3,
        impactWeight: 1.2,
      };
    }
    const next = k !== null ? Math.round(k * 1.3) + 1 : 5;
    return {
      title: `Aujourd'hui, autorise-toi jusqu'à ${next} cigarettes, mais note l'heure et la raison à chaque fois — l'objectif est de garder juste le contrôle, pas encore de réduire davantage.`,
      description: null,
      why: "Revenir à un palier moins exigeant évite l'abandon complet quand la réduction va trop vite.",
      type: "MICRO",
      estimatedMinutes: 5,
      difficulty: 1,
      impactWeight: 0.8,
    };
  },
};
