import { z } from "zod";
import { AttachmentCategory, LeadStage, PipelineStageCategory, PropertyType } from "@/generated/prisma/enums";
import { enumTuple } from "./enum-helpers";

export const propertyTypeSchema = z.enum(enumTuple(PropertyType));
export const attachmentCategorySchema = z.enum(enumTuple(AttachmentCategory));
export const pipelineStageCategorySchema = z.enum(enumTuple(PipelineStageCategory));
export const leadStageKeySchema = z.enum(enumTuple(LeadStage));

export const pipelineStageUpdateSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format hexadécimal (#rrggbb).")
    .optional(),
  category: pipelineStageCategorySchema.optional(),
});

export const pipelineStageReorderSchema = z.object({
  orderedStageKeys: z.array(leadStageKeySchema).min(1),
});

/**
 * Entités pouvant porter des pièces jointes (v0.9, ADR 0038) — liste fermée,
 * jamais une chaîne libre : `Attachment.entityType` est un nom de modèle en
 * dur vérifié par `resolveAttachmentEntity` (voir `attachment-service.ts`).
 */
export const ATTACHMENT_ENTITY_TYPES = ["Lead", "Company", "Property", "VirtualTour", "Quote", "Invoice"] as const;
export const attachmentEntityTypeSchema = z.enum(ATTACHMENT_ENTITY_TYPES);

export const companyCreateSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  name: z.string().min(1).max(200),
  legalName: z.string().max(200).optional().nullable(),
  siret: z.string().max(20).optional().nullable(),
  website: z.string().url().optional().or(z.literal("")).nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const companyUpdateSchema = companyCreateSchema.partial();

export const propertyCreateSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  leadId: z.string().min(1),
  companyId: z.string().optional().nullable(),
  type: propertyTypeSchema.default("OTHER"),
  label: z.string().min(1).max(200),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  surfaceM2: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const propertyUpdateSchema = propertyCreateSchema.omit({ leadId: true }).partial();

export const attachmentCreateSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().min(1),
  category: attachmentCategorySchema,
  fileName: z.string().min(1).max(300),
  url: z.string().url(),
  mimeType: z.string().max(150).optional().nullable(),
  sizeBytes: z.coerce.number().int().min(0).optional().nullable(),
});
