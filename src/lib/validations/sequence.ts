import { z } from "zod";
import { SequenceChannel } from "@/generated/prisma/enums";
import { enumTuple } from "./enum-helpers";

export const sequenceStepSchema = z.object({
  order: z.coerce.number().int().min(1),
  delayDays: z.coerce.number().int().min(0),
  channel: z.enum(enumTuple(SequenceChannel)),
  templateKey: z.string().min(1),
  allowedStartHour: z.coerce.number().int().min(0).max(23).default(8),
  allowedEndHour: z.coerce.number().int().min(1).max(24).default(18),
  allowedWeekdays: z.array(z.coerce.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  requiresValidation: z.coerce.boolean().default(true),
});

export const sequenceSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
  steps: z
    .array(sequenceStepSchema)
    .min(1)
    .refine((steps) => new Set(steps.map((s) => s.order)).size === steps.length, {
      message: "Chaque étape doit avoir un numéro d'ordre unique.",
    }),
});

export const enrollSchema = z.object({
  leadId: z.string(),
  sequenceId: z.string(),
  campaignId: z.string().optional().nullable(),
});
