import { z } from "zod";

export const communicationChannelSchema = z.enum(["SMS", "WHATSAPP", "PHONE", "WEBHOOK"]);

export const sendCommunicationSchema = z.object({
  channel: communicationChannelSchema,
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const communicationConfigUpdateSchema = z.object({
  provider: z.string().min(1).max(60),
  config: z.record(z.string(), z.unknown()).optional(),
});
