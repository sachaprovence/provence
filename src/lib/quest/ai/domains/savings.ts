import "server-only";
import type { DomainHandler, DomainQuestDraft } from "../goal-domain";
import { firstNumber } from "../goal-domain";

/** Épargne — la capacité mensuelle réelle change directement l'action concrète (montant à virer, échéance). */

const TARGET_REGEX = /(\d[\d\s]*(?:[.,]\d+)?)\s*(?:€|euros?)/i;
const LEVEL_REGEX = /mettre\s+(\d+(?:[.,]\d+)?)\s*€\s+de\s+côté\s+par\s+mois/i;

function parseAmount(text: string): number | null {
  const m = text.match(TARGET_REGEX);
  if (!m) return null;
  return parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
}

function targetAmountFrom(title: string, description: string | null): number {
  return parseAmount(`${title} ${description ?? ""}`) ?? 1000;
}

function monthlyAmountFrom(currentStateText: string | null): number | null {
  if (!currentStateText) return null;
  const m = currentStateText.match(LEVEL_REGEX);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function formatEuros(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

export const savingsDomain: DomainHandler = {
  domain: "SAVINGS",

  matches(title, description) {
    return /économiser|épargn|mettre\s+de\s+côté/i.test(`${title} ${description ?? ""}`);
  },

  hasEnoughInfo(_title, _description, currentStateText) {
    return monthlyAmountFrom(currentStateText) !== null;
  },

  levelQuestion() {
    return "Combien peux-tu réalistement mettre de côté chaque mois, dès aujourd'hui ?";
  },

  parseLevelAnswer(_title, _description, rawAnswer) {
    const monthly = firstNumber(rawAnswer) ?? 50;
    return `Peut mettre ${Math.round(monthly)} € de côté par mois actuellement.`;
  },

  buildMilestones(ctx) {
    const target = targetAmountFrom(ctx.title, ctx.description);
    const ratios = [0.1, 0.35, 0.65, 1];
    return ratios.map((ratio, i) => ({
      title: `Avoir économisé ${formatEuros(target * ratio)}`,
      description: null,
      weight: Math.round((0.6 + i * 0.5) * 100) / 100,
    }));
  },

  buildQuestsForMilestone(ctx, milestone, count) {
    const monthly = monthlyAmountFrom(ctx.currentStateText) ?? 50;
    const templates: DomainQuestDraft[] = [
      {
        title: `Ouvre un compte épargne dédié à cet objectif (si tu n'en as pas déjà un) et vire-y immédiatement ${formatEuros(monthly)}.`,
        description: null,
        why: "Séparer l'épargne du compte courant évite qu'elle se fasse discrètement dépenser au fil du mois.",
        type: "SHORT",
        estimatedMinutes: 20,
        difficulty: 1,
        impactWeight: 1,
      },
      {
        title: `Mets en place un virement automatique de ${formatEuros(monthly)} le lendemain de chaque paie.`,
        description: null,
        why: "Automatiser l'épargne dès la paie garantit qu'elle a lieu, sans dépendre de la volonté chaque mois.",
        type: "SHORT",
        estimatedMinutes: 15,
        difficulty: 1,
        impactWeight: 1.3,
      },
      {
        title: "Passe en revue toutes tes dépenses du dernier mois par catégorie et identifie une dépense récurrente à réduire d'au moins 20 €.",
        description: null,
        why: "Augmenter la capacité mensuelle d'épargne accélère mécaniquement l'atteinte de l'objectif.",
        type: "NORMAL",
        estimatedMinutes: 30,
        difficulty: 2,
        impactWeight: 1.5,
      },
      {
        title: `Vérifie ton solde d'épargne actuel et calcule combien de mois il te reste avant ${formatEuros(targetAmountFrom(ctx.title, ctx.description))}.`,
        description: null,
        why: "Mesurer régulièrement l'écart restant entretient la motivation et permet d'ajuster le rythme si besoin.",
        type: "MICRO",
        estimatedMinutes: 10,
        difficulty: 1,
        impactWeight: 1.6,
      },
    ];
    const index = Math.max(0, Math.min(templates.length - 1, milestone.order));
    return [templates[index]].slice(0, Math.max(1, count));
  },

  adjustQuest(previousQuestTitle, direction) {
    const n = firstNumber(previousQuestTitle) ?? 50;
    if (direction === "HARDER") {
      const next = Math.round(n * 1.4);
      return {
        title: `Augmente ton virement automatique mensuel à ${formatEuros(next)} dès ce mois-ci.`,
        description: null,
        why: "Augmenter le montant mis de côté chaque mois raccourcit directement le délai pour atteindre l'objectif.",
        type: "SHORT",
        estimatedMinutes: 15,
        difficulty: 2,
        impactWeight: 1.2,
      };
    }
    const next = Math.max(10, Math.round(n * 0.6));
    return {
      title: `Réduis temporairement ton virement automatique à ${formatEuros(next)} par mois, le temps de stabiliser le rythme.`,
      description: null,
      why: "Un montant plus faible mais tenu dans la durée vaut mieux qu'un montant ambitieux abandonné après un mois.",
      type: "MICRO",
      estimatedMinutes: 10,
      difficulty: 1,
      impactWeight: 0.8,
    };
  },
};
