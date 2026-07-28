import { z } from "zod";
import { LeadCategory, LeadStage } from "@/generated/prisma/enums";
import { enumTuple } from "./enum-helpers";

export const leadCategorySchema = z.enum(enumTuple(LeadCategory));
export const leadStageSchema = z.enum(enumTuple(LeadStage));

export const leadCreateSchema = z.object({
  establishmentName: z.string().min(1).max(200),
  category: leadCategorySchema.default("OTHER"),
  icpId: z.string().optional().nullable(),
  territoryId: z.string().optional().nullable(),
  websiteUrl: z.string().url().optional().or(z.literal("")).nullable(),
  publicListingUrl: z.string().url().optional().or(z.literal("")).nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional(),
  reviewCount: z.coerce.number().int().min(0).optional().nullable(),
  averageRating: z.coerce.number().min(0).max(5).optional().nullable(),
  hasVirtualTour: z.coerce.boolean().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().or(z.literal("")).nullable(),
  contactPhone: z.string().optional().nullable(),
  contactJobTitle: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  stage: leadStageSchema.optional(),
  closedBusiness: z.coerce.boolean().optional(),
  assignedToId: z.string().optional().nullable(),
});

export const csvColumnMap = {
  establishmentName: ["nom", "nom de l'établissement", "establishment", "name"],
  category: ["catégorie", "categorie", "category"],
  contactName: ["contact", "nom du contact", "contact name"],
  contactJobTitle: ["fonction", "job title", "role"],
  contactEmail: ["email", "adresse email", "e-mail"],
  contactPhone: ["téléphone", "telephone", "phone"],
  websiteUrl: ["site internet", "site web", "website"],
  publicListingUrl: ["url fiche", "url", "listing url", "fiche"],
  address: ["adresse", "address"],
  city: ["ville", "city"],
  region: ["région", "region"],
  country: ["pays", "country"],
  reviewCount: ["nombre d'avis", "avis", "reviews"],
  averageRating: ["note moyenne", "note", "rating"],
  tags: ["tags", "étiquettes"],
  notes: ["notes", "remarques"],
} as const;

export type LeadCsvField = keyof typeof csvColumnMap;
