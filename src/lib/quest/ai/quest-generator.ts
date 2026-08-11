import "server-only";
import { generateStructured, isDemoMode, QUEST_AI_SYSTEM_PROMPT } from "./client";
import { QuestGenerationSchema, type QuestDraft, type QuestGeneration } from "./schemas";
import type { DifficultyBand } from "@/lib/quest/difficulty-engine";

/**
 * Génère 1 à 5 quêtes immédiatement pertinentes (§2/§7 du brief) — jamais
 * tout le parcours d'un coup. Utilisé à la fois pour la génération normale
 * (prochaines quêtes d'un jalon) et pour la décomposition (§17 : une quête
 * trop difficile devient plusieurs sous-quêtes plus petites).
 */

export type GenerateQuestsInput = {
  goalTitle: string;
  goalDescription: string | null;
  milestone: { title: string; description: string | null } | null;
  difficultyBand: DifficultyBand;
  activeMemories: { type: string; content: string }[];
  recentFeedbackSummary: string | null;
  count: number;
  mode: "NEXT" | "DECOMPOSE";
  decomposeSource?: { title: string; description: string | null };
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

function demoGenerateQuests(input: GenerateQuestsInput): QuestGeneration {
  // En mode DECOMPOSE, la source est déjà une phrase complète (le titre d'une quête générée
  // précédemment, potentiellement elle-même déjà entre guillemets) — jamais ré-entourée de
  // guillemets, pour éviter un emboîtement illisible après plusieurs décompositions en cascade.
  const target =
    input.mode === "DECOMPOSE" && input.decomposeSource
      ? input.decomposeSource.title.replace(/[.!?]+$/, "")
      : (input.milestone?.title ?? input.goalTitle);

  const templates: { suffix: string; baseDifficulty: number; why: string }[] =
    input.mode === "DECOMPOSE"
      ? [
          { suffix: `Définis la toute première étape, la plus petite possible, pour : ${target}.`, baseDifficulty: 1, why: "Repartir d'un pas plus petit pour débloquer la dynamique." },
          { suffix: `Prépare ce qu'il te faut (script, exemple, information manquante) pour : ${target} — sans encore l'exécuter.`, baseDifficulty: 1, why: "Séparer la préparation de l'exécution réduit la charge perçue." },
          { suffix: `Fais une version minimale, en une fois et sans viser la perfection, pour : ${target}.`, baseDifficulty: 2, why: "Une première itération imparfaite débloque mieux qu'une planification supplémentaire." },
        ]
      : [
          { suffix: `Écris en une phrase concrète et mesurable ce que représente « ${target} » pour toi.`, baseDifficulty: 1, why: "Une cible floue ne peut pas être découpée en actions." },
          { suffix: `Liste 3 signes qui montreraient que tu progresses sur « ${target} ».`, baseDifficulty: 1, why: "Sert à mesurer objectivement la progression, pas au ressenti." },
          { suffix: `Fais une première action réelle (pas une préparation) qui avance « ${target} ».`, baseDifficulty: 2, why: "L'action réelle compte plus que la préparation à ce stade." },
          { suffix: `Consacre un vrai créneau concentré à avancer sérieusement sur « ${target} ».`, baseDifficulty: 3, why: "Un jalon important mérite un temps dédié, pas des minutes volées entre deux tâches." },
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
      impactWeight: input.mode === "DECOMPOSE" ? 0.6 : 1,
      milestoneTitle: input.mode === "DECOMPOSE" ? null : (input.milestone?.title ?? null),
    });
  }

  return QuestGenerationSchema.parse({ quests });
}

export async function generateQuests(input: GenerateQuestsInput): Promise<QuestGeneration> {
  if (isDemoMode()) return demoGenerateQuests(input);

  const context =
    input.mode === "DECOMPOSE" && input.decomposeSource
      ? `L'utilisateur bute sur cette quête, trop difficile ou trop grande : "${input.decomposeSource.title}"${
          input.decomposeSource.description ? ` (${input.decomposeSource.description})` : ""
        }. Décompose-la en ${input.count} sous-quêtes plus petites et plus faciles, qui mènent progressivement au même résultat.`
      : `Génère ${input.count} quêtes immédiatement pertinentes pour faire avancer le jalon "${input.milestone?.title ?? "(aucun jalon, directement sur l'objectif)"}" de l'objectif "${input.goalTitle}".`;

  const prompt = `Objectif : "${input.goalTitle}"${input.goalDescription ? `\nDescription : ${input.goalDescription}` : ""}

${context}

Difficulté cible (1-5) : entre ${input.difficultyBand.minDifficulty} et ${input.difficultyBand.maxDifficulty} (adaptée au niveau actuel de l'utilisateur, ne pas dépasser).
${input.recentFeedbackSummary ? `\nComportement récent observé : ${input.recentFeedbackSummary}` : ""}
${
  input.activeMemories.length > 0
    ? `\nCe qu'on sait déjà sur l'utilisateur : ${input.activeMemories.map((m) => `- (${m.type}) ${m.content}`).join("\n")}`
    : ""
}

Chaque quête doit être concrète, courte autant que possible, réalisable, mesurable — jamais générique ("travaille sur ton objectif" est interdit).

Réponds UNIQUEMENT avec un objet JSON : { "quests": [{ "title": string, "description": string | null, "why": string | null, "type": "MICRO"|"SHORT"|"NORMAL"|"DEEP"|"HABIT"|"CHALLENGE"|"BOSS", "estimatedMinutes": number, "difficulty": number, "impactWeight": number, "milestoneTitle": string | null }] }`;

  return generateStructured({
    schema: QuestGenerationSchema,
    system: QUEST_AI_SYSTEM_PROMPT,
    prompt,
    context: "quest-generator",
  });
}
