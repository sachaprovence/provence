import { z } from "zod";

export const createGoalSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
});

export const answerClarifyingQuestionsSchema = z.object({
  answers: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1).max(1000) })).min(1).max(7),
});

export const nextActionContextSchema = z.object({
  availableMinutes: z.coerce.number().int().min(1).max(600).optional().nullable(),
  energy: z.enum(["LOW", "NORMAL", "HIGH"]).optional().nullable(),
  context: z.enum(["HOME", "WORK", "OUTSIDE", "COMPUTER", "PHONE"]).optional().nullable(),
});

export const checkInSchema = z.object({
  energy: z.coerce.number().int().min(1).max(5).optional().nullable(),
  motivation: z.coerce.number().int().min(1).max(5).optional().nullable(),
  availableMinutes: z.coerce.number().int().min(1).max(600).optional().nullable(),
});

export const questFeedbackNoteSchema = z.object({
  note: z.string().max(1000).optional().nullable(),
});

export const assistantMessageSchema = z.object({
  conversationId: z.string().optional().nullable(),
  message: z.string().min(1).max(4000),
});

export const goalStatusUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "ABANDONED", "ARCHIVED"]),
});

export const memoryUpdateSchema = z.object({
  action: z.enum(["CONFIRM", "DELETE"]),
});
