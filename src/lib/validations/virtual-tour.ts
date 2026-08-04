import { z } from "zod";
import { PropertyType, VirtualTourStatus } from "@/generated/prisma/enums";
import { enumTuple } from "./enum-helpers";

export const virtualTourStatusSchema = z.enum(enumTuple(VirtualTourStatus));

export const virtualTourCreateSchema = z.object({
  missionId: z.string().min(1),
  propertyId: z.string().optional().nullable(),
  type: z.enum(enumTuple(PropertyType)).default("OTHER"),
  address: z.string().optional().nullable(),
  // GPS (v1.1, AR-0166) — repris automatiquement de la Property liée si non fourni (voir resolveCoordinates()).
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  surfaceM2: z.coerce.number().min(0).optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  scheduledDurationMinutes: z.coerce.number().int().min(0).optional().nullable(),
  equipmentUsed: z.string().max(500).optional().nullable(),
  matterportUrl: z.string().url().optional().or(z.literal("")).nullable(),
  tourUrl: z.string().url().optional().or(z.literal("")).nullable(),
  notes: z.string().optional().nullable(),
});

export const virtualTourUpdateSchema = virtualTourCreateSchema
  .omit({ missionId: true })
  .partial()
  .extend({ status: virtualTourStatusSchema.optional() });
