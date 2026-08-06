import { z } from "zod";

export const createCustomAgentSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  systemPrompt: z.string().max(8000).optional().nullable(),
  providerKey: z.string().min(1).max(60).optional(),
  model: z.string().max(120).optional().nullable(),
  toolKeys: z.array(z.string()).max(50).optional(),
  memoryEnabled: z.boolean().optional(),
});

export const updateCustomAgentSchema = createCustomAgentSchema.partial();

export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(8000),
});

export const runToolSchema = z.object({
  toolKey: z.string().min(1),
  input: z.unknown().optional(),
});
