import "server-only";
import { generateStructured, isDemoMode, QUEST_AI_SYSTEM_PROMPT } from "./client";
import { QuestGenerationSchema, type QuestDraft, type QuestGeneration } from "./schemas";
import type { DifficultyBand } from "@/lib/quest/difficulty-engine";
import type { DomainQuestDraft } from "./goal-domain";
import { detectDomainHandler } from "./domains/registry";

/**
 * Génère 1 à 5 quêtes immédiatement pertinentes (§2/§7 du brief) — jamais
 * tout le parcours d'un coup. Trois modes :
 * - `NEXT` : prochaines quêtes d'un jalon (planification normale).
 * - `DECOMPOSE` : la quête `sourceQuest` est trop difficile/bloquée -> une
 *   version PLUS FACILE (§17 du brief).
 * - `INCREASE` : la quête `sourceQuest` est trop facile -> une version PLUS
 *   DIFFICILE (§16 du brief, adaptation à la hausse).
 *
 * Suite au retour terrain : en mode démo, un domaine est d'abord détecté
 * (`src/lib/quest/ai/domains/registry.ts`) pour produire des quêtes
 * réellement spécifiques (course à pied, musculation, prospection...) —
 * les gabarits génériques ci-dessous ne servent plus que de filet de
 * sécurité pour un objectif dont le domaine n'est pas reconnu.
 */

export type GenerateQuestsInput = {
  goalTitle: string;
  goalDescription: string | null;
  /** `QuestGoal.currentState` — porte le niveau actuel de l'utilisateur déjà analysé (voir `goal-analyzer.ts`), reparsable par le domaine détecté. */
  goalCurrentState: string | null;
  milestone: { title: string; description: string | null; order: number } | null;
  difficultyBand: DifficultyBand;
  activeMemories: { type: string; content: string }[];
  recentFeedbackSummary: string | null;
  count: number;
  mode: "NEXT" | "DECOMPOSE" | "INCREASE";
  /** Quête d'origine pour les modes `DECOMPOSE`/`INCREASE` — jamais utilisé en mode `NEXT`. */
  sourceQuest?: { title: string; description: string | null };
};

const TYPE_BY_DIFFICULTY: Record<number, { type: QuestDraft["type"]; minutes: number }> = {
  1: { type: "MICRO", minutes: 10 },
  2: { type: "SHORT", minutes: 20 },
  3: { type: "NORMAL", minutes: 35 },
  4: { type: "DEEP", minutes: 60 },
  5: { type: "DEEP", minutes: 90 },
};

function clampToBand(difficulty: number, band: DifficultyBand): number {
  return Math.max(band.minDifficulty, Math.min(band.maxDifficulty, difficulty));
}

function toQuestDraft(draft: DomainQuestDraft, milestoneTitle: string | null): QuestDraft {
  return {
    title: draft.title,
    description: draft.description,
    why: draft.why,
    type: draft.type,
    estimatedMinutes: draft.estimatedMinutes,
    difficulty: draft.difficulty,
    impactWeight: draft.impactWeight,
    milestoneTitle,
  };
}

/** Filet de sécurité générique — uniquement pour un objectif dont aucun domaine n'est reconnu. */
function genericFallbackQuests(input: GenerateQuestsInput): QuestGeneration {
  const target =
    (input.mode === "DECOMPOSE" || input.mode === "INCREASE") && input.sourceQuest
      ? input.sourceQuest.title.replace(/[.!?]+$/, "")
      : (input.milestone?.title ?? input.goalTitle);

  const templates: { suffix: string; baseDifficulty: number; why: string }[] =
    input.mode === "DECOMPOSE"
      ? [
          { suffix: `Définis la toute première étape, la plus petite possible, pour : ${target}.`, baseDifficulty: 1, why: "Repartir d'un pas plus petit pour débloquer la dynamique." },
          { suffix: `Prépare ce qu'il te faut (script, exemple, information manquante) pour : ${target} — sans encore l'exécuter.`, baseDifficulty: 1, why: "Séparer la préparation de l'exécution réduit la charge perçue." },
          { suffix: `Fais une version minimale, en une fois et sans viser la perfection, pour : ${target}.`, baseDifficulty: 2, why: "Une première itération imparfaite débloque mieux qu'une planification supplémentaire." },
        ]
      : input.mode === "INCREASE"
        ? [{ suffix: `Fais une version plus ambitieuse de : ${target}.`, baseDifficulty: 3, why: "Le niveau précédent était trop facile — il faut augmenter le défi." }]
        : [
            { suffix: `Avance concrètement sur : ${target}.`, baseDifficulty: 2, why: "Une action réelle fait progresser plus qu'une réflexion supplémentaire." },
            { suffix: `Fais une première action mesurable pour : ${target}.`, baseDifficulty: 2, why: "Une action mesurable permet de savoir objectivement si tu progresses." },
          ];

  const quests: QuestDraft[] = [];
  for (let i = 0; i < input.count; i += 1) {
    const template = templates[i % templates.length];
    const difficulty = clampToBand(template.baseDifficulty, input.difficultyBand);
    const typeInfo = TYPE_BY_DIFFICULTY[difficulty];
    quests.push({
      title: template.suffix,
      description: null,
      why: template.why,
      type: typeInfo.type,
      estimatedMinutes: typeInfo.minutes,
      difficulty,
      impactWeight: input.mode === "NEXT" ? 1 : 0.6,
      milestoneTitle: input.mode === "NEXT" ? (input.milestone?.title ?? null) : null,
    });
  }

  return QuestGenerationSchema.parse({ quests });
}

function demoGenerateQuests(input: GenerateQuestsInput): QuestGeneration {
  const handler = detectDomainHandler(input.goalTitle, input.goalDescription);
  if (!handler) return genericFallbackQuests(input);

  if (input.mode !== "NEXT") {
    if (!input.sourceQuest) return genericFallbackQuests(input);
    const direction = input.mode === "DECOMPOSE" ? "EASIER" : "HARDER";
    const draft = handler.adjustQuest(input.sourceQuest.title, direction);
    return QuestGenerationSchema.parse({ quests: [toQuestDraft(draft, null)] });
  }

  const ctx = { title: input.goalTitle, description: input.goalDescription, currentStateText: input.goalCurrentState };
  const milestone = input.milestone ?? { title: input.goalTitle, description: null, order: 0 };
  const drafts = handler.buildQuestsForMilestone(ctx, { title: milestone.title, order: milestone.order }, input.count);
  if (drafts.length === 0) return genericFallbackQuests(input);
  return QuestGenerationSchema.parse({ quests: drafts.map((d) => toQuestDraft(d, input.milestone?.title ?? null)) });
}

export async function generateQuests(input: GenerateQuestsInput): Promise<QuestGeneration> {
  if (isDemoMode()) return demoGenerateQuests(input);

  const domainHint = detectDomainHandler(input.goalTitle, input.goalDescription)?.domain ?? null;

  const context =
    (input.mode === "DECOMPOSE" || input.mode === "INCREASE") && input.sourceQuest
      ? input.mode === "DECOMPOSE"
        ? `L'utilisateur bute sur cette quête, trop difficile ou trop grande : "${input.sourceQuest.title}"${
            input.sourceQuest.description ? ` (${input.sourceQuest.description})` : ""
          }. Propose ${input.count} version(s) PLUS FACILE(S) qui mène(nt) au même progrès (ex. réduire la durée/le volume, découper en étapes, alterner effort/repos) — jamais une simple reformulation aussi difficile.`
        : `Cette quête était trop facile pour l'utilisateur : "${input.sourceQuest.title}"${
            input.sourceQuest.description ? ` (${input.sourceQuest.description})` : ""
          }. Propose ${input.count} version(s) PLUS DIFFICILE(S) dans la continuité logique (ex. augmenter la durée/le volume/l'intensité), en restant réaliste pour la prochaine séance.`
      : `Génère ${input.count} quêtes immédiatement pertinentes pour faire avancer le jalon "${input.milestone?.title ?? "(aucun jalon, directement sur l'objectif)"}" de l'objectif "${input.goalTitle}".`;

  const prompt = `Objectif : "${input.goalTitle}"${input.goalDescription ? `\nDescription : ${input.goalDescription}` : ""}
${input.goalCurrentState ? `Niveau actuel connu : ${input.goalCurrentState}` : ""}
${domainHint ? `Domaine détecté (indicatif) : ${domainHint}.` : ""}

${context}

Difficulté cible (1-5) : entre ${input.difficultyBand.minDifficulty} et ${input.difficultyBand.maxDifficulty} (adaptée au niveau actuel de l'utilisateur, ne pas dépasser).
${input.recentFeedbackSummary ? `\nComportement récent observé : ${input.recentFeedbackSummary}` : ""}
${
  input.activeMemories.length > 0
    ? `\nCe qu'on sait déjà sur l'utilisateur : ${input.activeMemories.map((m) => `- (${m.type}) ${m.content}`).join("\n")}`
    : ""
}

PRINCIPE CENTRAL : chaque quête doit être spécifique à CET objectif précis, concrète, exécutable dans la vraie vie MAINTENANT, mesurable, et adaptée au niveau actuel connu. Utilise les chiffres/unités propres au domaine (minutes courues, répétitions, nombre de prospects, montant en €, cigarettes/jour...), jamais une formulation qui s'appliquerait à n'importe quel objectif. Les phrases génériques ("définis ton objectif", "décris en une phrase ce que représente ton objectif", "liste 3 signes de progression", "fais une première action réelle") sont INTERDITES dès que l'objectif est déjà précis.

Réponds UNIQUEMENT avec un objet JSON : { "quests": [{ "title": string, "description": string | null, "why": string | null, "type": "MICRO"|"SHORT"|"NORMAL"|"DEEP"|"HABIT"|"CHALLENGE"|"BOSS", "estimatedMinutes": number, "difficulty": number, "impactWeight": number, "milestoneTitle": string | null }] }`;

  return generateStructured({
    schema: QuestGenerationSchema,
    system: QUEST_AI_SYSTEM_PROMPT,
    prompt,
    context: "quest-generator",
  });
}
