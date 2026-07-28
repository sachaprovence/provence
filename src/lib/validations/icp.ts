import { z } from "zod";
import { leadCategorySchema } from "./lead";

export const icpSchema = z.object({
  name: z.string().min(1).max(150),
  category: leadCategorySchema,
  zones: z.array(z.string()).default([]),
  sizeNote: z.string().optional().nullable(),
  priceRange: z.string().optional().nullable(),
  estimatedUnits: z.string().optional().nullable(),
  hasVirtualTourExpected: z.coerce.boolean().default(false),
  websiteQualityNote: z.string().optional().nullable(),
  socialPresenceNote: z.string().optional().nullable(),
  minRating: z.coerce.number().min(0).max(5).optional().nullable(),
  minReviewCount: z.coerce.number().int().min(0).optional().nullable(),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  positiveKeywords: z.array(z.string()).default([]),
  exclusionCriteria: z.array(z.string()).default([]),
  isActive: z.coerce.boolean().default(true),
});
