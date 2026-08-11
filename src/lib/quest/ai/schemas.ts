import { z } from "zod";

/**
 * Sorties IA structurées (§43 du brief) — chaque génération critique passe
 * par un de ces schémas Zod, jamais une sortie LLM consommée brute. Utilisés
 * à la fois par le mode réel (validation de la réponse Anthropic) et comme
 * contrat de forme pour le mode démo (mêmes types des deux côtés).
 */

export const ClarifyingAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
export type ClarifyingAnswer = z.infer<typeof ClarifyingAnswerSchema>;

export const GoalAnalysisSchema = z.object({
  currentState: z.string().nullable().default(null),
  targetState: z.string().nullable().default(null),
  constraints: z.array(z.string()).default([]),
  timeAvailable: z.string().nullable().default(null),
  deadlineHint: z.string().nullable().default(null),
  resources: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  successMetrics: z.array(z.string()).default([]),
  /** 0 à 7 questions (§4 du brief) — vide quand l'analyse est jugée suffisante pour planifier. */
  clarifyingQuestions: z.array(z.string()).max(7).default([]),
  difficultyEstimate: z.number().int().min(1).max(5).default(3),
});
export type GoalAnalysis = z.infer<typeof GoalAnalysisSchema>;

export const MilestoneDraftSchema = z.object({
  title: z.string(),
  description: z.string().nullable().default(null),
  weight: z.number().min(0.5).max(5).default(1),
});
export type MilestoneDraft = z.infer<typeof MilestoneDraftSchema>;

export const GoalPlanSchema = z.object({
  milestones: z.array(MilestoneDraftSchema).min(3).max(8),
});
export type GoalPlan = z.infer<typeof GoalPlanSchema>;

export const QUEST_TYPE_VALUES = ["MICRO", "SHORT", "NORMAL", "DEEP", "HABIT", "CHALLENGE", "BOSS"] as const;

export const QuestDraftSchema = z.object({
  title: z.string(),
  description: z.string().nullable().default(null),
  why: z.string().nullable().default(null),
  type: z.enum(QUEST_TYPE_VALUES).default("NORMAL"),
  estimatedMinutes: z.number().int().min(2).max(480),
  difficulty: z.number().int().min(1).max(5).default(3),
  impactWeight: z.number().min(0.2).max(5).default(1),
  /** Titre du jalon ciblé — résolu côté service vers un `milestoneId` réel (jamais un id fabriqué par le LLM). */
  milestoneTitle: z.string().nullable().default(null),
});
export type QuestDraft = z.infer<typeof QuestDraftSchema>;

export const QuestGenerationSchema = z.object({
  quests: z.array(QuestDraftSchema).min(1).max(5),
});
export type QuestGeneration = z.infer<typeof QuestGenerationSchema>;

export const QUEST_MEMORY_TYPE_VALUES = [
  "TIMING_PREFERENCE",
  "DURATION_PREFERENCE",
  "TASK_TYPE_RESISTANCE",
  "SUPPORT_NEED",
  "SUCCESS_PATTERN",
  "AVAILABILITY",
  "OTHER",
] as const;

export const AssistantActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PAUSE_GOAL"), goalId: z.string() }),
  z.object({ kind: z.literal("RESUME_GOAL"), goalId: z.string() }),
  z.object({ kind: z.literal("REPLACE_QUEST"), questId: z.string(), reason: z.string().nullable().default(null) }),
  z.object({ kind: z.literal("REDUCE_DIFFICULTY"), questId: z.string() }),
  z.object({ kind: z.literal("DECOMPOSE_QUEST"), questId: z.string() }),
  z.object({ kind: z.literal("NONE") }),
]);
export type AssistantAction = z.infer<typeof AssistantActionSchema>;

export const AssistantReplySchema = z.object({
  message: z.string(),
  actions: z.array(AssistantActionSchema).default([]),
});
export type AssistantReply = z.infer<typeof AssistantReplySchema>;
