import { z } from "zod";

export const notificationPreferencesUpdateSchema = z.object({
  preferences: z.array(
    z.object({
      eventKey: z.string().min(1),
      channel: z.enum(["APP", "EMAIL"]),
      enabled: z.boolean(),
    })
  ),
});
