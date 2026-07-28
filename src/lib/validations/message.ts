import { z } from "zod";
import { MessageLanguage, MessageTone, MessageType } from "@/generated/prisma/enums";
import { enumTuple } from "./enum-helpers";

export const generateMessageSchema = z.object({
  leadId: z.string(),
  type: z.enum(enumTuple(MessageType)),
  tone: z.enum(enumTuple(MessageTone)).default("PROFESSIONAL"),
  language: z.enum(enumTuple(MessageLanguage)).default("FR"),
});

export const updateMessageSchema = z.object({
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
});

export const validateMessageSchema = z.object({
  approve: z.boolean(),
  editedSubject: z.string().optional().nullable(),
  editedBody: z.string().optional(),
});
