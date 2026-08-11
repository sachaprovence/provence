import "server-only";
import type { DomainHandler, DomainQuestDraft } from "../goal-domain";

/** Apprentissage d'une langue — le niveau actuel change fortement la nature de la première action (vocabulaire vs conversation). */

const LANGUAGE_WORDS: Record<string, string> = {
  anglais: "anglais",
  espagnol: "espagnol",
  allemand: "allemand",
  italien: "italien",
  english: "anglais",
};

type Level = "DEBUTANT" | "INTERMEDIAIRE" | "AVANCE";

const LEVEL_REGEX = /niveau actuel en \S+\s*:\s*(débutant|intermédiaire|avancé)/i;

function extractLanguage(text: string): string {
  const lower = text.toLowerCase();
  const found = Object.keys(LANGUAGE_WORDS).find((w) => lower.includes(w));
  return found ? LANGUAGE_WORDS[found] : "cette langue";
}

function normalizeLevel(raw: string): Level {
  const lower = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (lower.includes("avance") || lower.includes("courant") || lower.includes("fluide")) return "AVANCE";
  if (lower.includes("intermediaire") || lower.includes("moyen")) return "INTERMEDIAIRE";
  return "DEBUTANT";
}

function levelFrom(currentStateText: string | null): Level | null {
  if (!currentStateText) return null;
  const m = currentStateText.match(LEVEL_REGEX);
  if (!m) return null;
  return normalizeLevel(m[1]);
}

const MILESTONES_BY_LEVEL: Record<Level, string[]> = {
  DEBUTANT: [
    "Connaître 100 mots de vocabulaire essentiel et les phrases de base",
    "Tenir une conversation simple de 5 minutes",
    "Comprendre une vidéo courte sans sous-titres en français",
    "Tenir une conversation fluide de 15 minutes sur un sujet varié",
  ],
  INTERMEDIAIRE: [
    "Tenir une conversation de 10 minutes sans chercher ses mots",
    "Comprendre un podcast ou une vidéo authentique sans sous-titres",
    "Tenir une conversation fluide de 15 minutes sur un sujet varié",
  ],
  AVANCE: ["Tenir une conversation fluide de 20 minutes sur un sujet technique ou abstrait", "Être à l'aise à l'écrit comme à l'oral en toute situation"],
};

const QUESTS_BY_LEVEL: Record<Level, ((language: string) => DomainQuestDraft)[]> = {
  DEBUTANT: [
    (language) => ({
      title: `Apprends 15 mots de vocabulaire essentiel en ${language} (salutations, se présenter, besoins du quotidien) et répète chacun à voix haute 3 fois.`,
      description: null,
      why: "Le vocabulaire de base est le prérequis à toute conversation, même très simple.",
      type: "MICRO",
      estimatedMinutes: 15,
      difficulty: 1,
      impactWeight: 1,
    }),
    (language) => ({
      title: `Enregistre-toi en te présentant en ${language} pendant 2 minutes (nom, métier, ce que tu aimes), puis réécoute-toi.`,
      description: null,
      why: "Parler à voix haute, même seul, est ce qui débloque le plus vite l'expression orale.",
      type: "SHORT",
      estimatedMinutes: 15,
      difficulty: 2,
      impactWeight: 1.2,
    }),
    (language) => ({
      title: `Regarde une vidéo de 10 minutes en ${language} sous-titrée dans la même langue, note 5 expressions nouvelles.`,
      description: null,
      why: "S'exposer à la langue authentique entraîne l'oreille bien avant de pouvoir tout comprendre.",
      type: "SHORT",
      estimatedMinutes: 20,
      difficulty: 2,
      impactWeight: 1.4,
    }),
    (language) => ({
      title: `Tiens une conversation de 15 minutes en ${language} avec un partenaire ou une IA, sans repasser au français.`,
      description: null,
      why: "La conversation réelle, même imparfaite, développe la fluidité mieux que n'importe quel exercice isolé.",
      type: "NORMAL",
      estimatedMinutes: 20,
      difficulty: 3,
      impactWeight: 1.8,
    }),
  ],
  INTERMEDIAIRE: [
    (language) => ({
      title: `Tiens une conversation de 10 minutes en ${language} sur un sujet du quotidien, en notant les mots qui te manquent.`,
      description: null,
      why: "Identifier précisément ce qui manque permet de cibler le vocabulaire à apprendre ensuite.",
      type: "SHORT",
      estimatedMinutes: 15,
      difficulty: 2,
      impactWeight: 1.2,
    }),
    (language) => ({
      title: `Écoute un podcast de 15 minutes en ${language} sans sous-titres, résume ensuite en 3 phrases ce que tu as compris.`,
      description: null,
      why: "Résumer force à reformuler, pas seulement à reconnaître passivement des mots.",
      type: "NORMAL",
      estimatedMinutes: 20,
      difficulty: 3,
      impactWeight: 1.4,
    }),
    (language) => ({
      title: `Tiens une conversation de 15 minutes en ${language} sur un sujet varié, sans repasser au français.`,
      description: null,
      why: "La conversation prolongée sur des sujets variés est ce qui construit la fluidité réelle.",
      type: "NORMAL",
      estimatedMinutes: 20,
      difficulty: 3,
      impactWeight: 1.8,
    }),
  ],
  AVANCE: [
    (language) => ({
      title: `Tiens une conversation de 20 minutes en ${language} sur un sujet technique ou professionnel, sans préparation.`,
      description: null,
      why: "À ce niveau, seule la pratique sur des sujets exigeants continue de faire progresser.",
      type: "NORMAL",
      estimatedMinutes: 25,
      difficulty: 4,
      impactWeight: 1.6,
    }),
    (language) => ({
      title: `Écris un texte de 200 mots en ${language} sur un sujet de ton choix, puis fais-le corriger (IA ou locuteur natif).`,
      description: null,
      why: "L'écrit force une précision grammaticale que l'oral ne demande pas toujours.",
      type: "SHORT",
      estimatedMinutes: 20,
      difficulty: 3,
      impactWeight: 1.4,
    }),
  ],
};

export const languageDomain: DomainHandler = {
  domain: "LANGUAGE",

  matches(title, description) {
    return /anglais|espagnol|allemand|italien|\bune?\s+langue\b|english/i.test(`${title} ${description ?? ""}`);
  },

  hasEnoughInfo(_title, _description, currentStateText) {
    return levelFrom(currentStateText) !== null;
  },

  levelQuestion(title, description) {
    const language = extractLanguage(`${title} ${description ?? ""}`);
    return `Quel est ton niveau actuel en ${language} : débutant, intermédiaire ou avancé ?`;
  },

  parseLevelAnswer(title, description, rawAnswer) {
    const language = extractLanguage(`${title} ${description ?? ""}`);
    const level = normalizeLevel(rawAnswer);
    const label = level === "DEBUTANT" ? "débutant" : level === "INTERMEDIAIRE" ? "intermédiaire" : "avancé";
    return `Niveau actuel en ${language} : ${label}.`;
  },

  buildMilestones(ctx) {
    const level = levelFrom(ctx.currentStateText) ?? "DEBUTANT";
    return MILESTONES_BY_LEVEL[level].map((title, i) => ({
      title,
      description: null,
      weight: Math.round((0.7 + i * 0.4) * 100) / 100,
    }));
  },

  buildQuestsForMilestone(ctx, milestone, count) {
    const level = levelFrom(ctx.currentStateText) ?? "DEBUTANT";
    const language = extractLanguage(`${ctx.title} ${ctx.description ?? ""}`);
    const builders = QUESTS_BY_LEVEL[level];
    const index = Math.max(0, Math.min(builders.length - 1, milestone.order));
    return [builders[index](language)].slice(0, Math.max(1, count));
  },

  adjustQuest(previousQuestTitle, direction) {
    const language = extractLanguage(previousQuestTitle) || "cette langue";
    if (direction === "HARDER") {
      return {
        title: `Tiens une conversation de 20 minutes en ${language} sur un sujet que tu ne maîtrises pas encore bien, sans notes.`,
        description: null,
        why: "Sortir de sa zone de confort thématique est ce qui pousse le vocabulaire à s'élargir.",
        type: "NORMAL",
        estimatedMinutes: 25,
        difficulty: 4,
        impactWeight: 1.2,
      };
    }
    return {
      title: `Apprends seulement 8 mots de vocabulaire essentiel en ${language} et répète-les à voix haute, sans viser une conversation aujourd'hui.`,
      description: null,
      why: "Revenir à une brique plus petite (vocabulaire seul) permet de reprendre confiance avant de reparler.",
      type: "MICRO",
      estimatedMinutes: 10,
      difficulty: 1,
      impactWeight: 0.8,
    };
  },
};
