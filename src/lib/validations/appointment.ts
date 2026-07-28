import { z } from "zod";

export const appointmentSchema = z.object({
  leadId: z.string(),
  title: z.string().min(1).max(200),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  location: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const appointmentUpdateSchema = appointmentSchema.partial().extend({
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  summary: z.string().optional().nullable(),
  nextAction: z.string().optional().nullable(),
});
