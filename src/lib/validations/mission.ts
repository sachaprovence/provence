import { z } from "zod";

export const missionUpdateSchema = z.object({
  status: z.enum(["PROPOSED", "ACCEPTED", "DECLINED", "IN_PROGRESS", "DELIVERED", "CANCELLED"]).optional(),
  scheduledAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  providerId: z.string().optional().nullable(),
});

export const missionDeliverableSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});
