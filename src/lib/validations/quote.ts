import { z } from "zod";

export const quoteLineSchema = z.object({
  serviceId: z.string().optional().nullable(),
  label: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().int().min(0),
});

export const quoteSchema = z.object({
  leadId: z.string(),
  opportunityId: z.string().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  lines: z.array(quoteLineSchema).min(1),
});

export const quoteDraftUpdateSchema = z.object({
  expiresAt: z.coerce.date().optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  lines: z.array(quoteLineSchema).min(1).optional(),
});

export const quoteSignatureRequestSchema = z.object({
  signerName: z.string().min(1).max(200),
  signerEmail: z.string().email(),
});

export const quoteSignatureResultSchema = z.object({
  status: z.enum(["SIGNED", "DECLINED"]),
});

export const opportunitySchema = z.object({
  leadId: z.string(),
  name: z.string().min(1).max(200),
  estimatedValue: z.coerce.number().int().min(0),
  probability: z.coerce.number().int().min(0).max(100).default(20),
  expectedCloseAt: z.coerce.date().optional().nullable(),
});

export const opportunityUpdateSchema = z.object({
  status: z.enum(["OPEN", "WON", "LOST"]).optional(),
  lostReason: z.string().optional().nullable(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  estimatedValue: z.coerce.number().int().min(0).optional(),
});
