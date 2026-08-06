import { z } from "zod";

export const connectWebhookSchema = z.object({
  webhookUrl: z.string().url().max(500),
});
