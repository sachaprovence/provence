import { z } from "zod";
import { PropertyType, VirtualTourStatus } from "@/generated/prisma/enums";
import { enumTuple } from "./enum-helpers";

export const virtualTourStatusSchema = z.enum(enumTuple(VirtualTourStatus));

export const virtualTourCreateSchema = z.object({
  missionId: z.string().min(1),
  propertyId: z.string().optional().nullable(),
  type: z.enum(enumTuple(PropertyType)).default("OTHER"),
  address: z.string().optional().nullable(),
  surfaceM2: z.coerce.number().min(0).optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  matterportUrl: z.string().url().optional().or(z.literal("")).nullable(),
  tourUrl: z.string().url().optional().or(z.literal("")).nullable(),
  notes: z.string().optional().nullable(),
});

export const virtualTourUpdateSchema = virtualTourCreateSchema
  .omit({ missionId: true })
  .partial()
  .extend({ status: virtualTourStatusSchema.optional() });
