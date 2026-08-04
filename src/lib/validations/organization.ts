import { z } from "zod";

export const organizationSettingsSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().optional().nullable(),
  website: z.string().url().optional().or(z.literal("")).nullable(),
  logoUrl: z.string().url().optional().or(z.literal("")).nullable(),
  services: z.array(z.string()).default([]),
  zones: z.array(z.string()).default([]),
  pricingNote: z.string().optional().nullable(),
  pitch: z.string().optional().nullable(),
  portfolioLinks: z.array(z.string()).default([]),
  availabilityNote: z.string().optional().nullable(),
  tone: z.enum(["professionnel", "direct_moderne", "haut_de_gamme"]).default("professionnel"),
  emailSignature: z.string().optional().nullable(),
  dailySendLimit: z.coerce.number().int().min(1).max(1000).default(50),
  rampUpEnabled: z.coerce.boolean().default(true),
  requireMessageValidation: z.coerce.boolean().default(true),
  /// Coordonnées légales/facturation (v0.9, task #92) — alimentent les PDF de devis/factures (voir `commercial-document-pdf.ts`/`invoice-service.ts`).
  vatNumber: z.string().max(40).optional().nullable(),
  siret: z.string().max(40).optional().nullable(),
  legalAddress: z.string().max(300).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  invoicePrefix: z.string().max(10).optional().nullable(),
  quotePrefix: z.string().max(10).optional().nullable(),
  /// Quota IA mensuel dur en USD (v0.9 bis, AR-0051) — `null`/absent = pas de quota (illimité). Voir `src/lib/ai/quota.ts`.
  aiMonthlyBudgetUsd: z.coerce.number().positive().optional().nullable(),
});

export const emailIntegrationConfigUpdateSchema = z.object({
  smtpHost: z.string().max(255).optional().or(z.literal("")),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().max(255).optional().or(z.literal("")),
  smtpPassword: z.string().max(500).optional().or(z.literal("")),
  smtpSecure: z.coerce.boolean().optional(),
  apiKey: z.string().max(500).optional().or(z.literal("")),
});

export const scoringRuleUpdateSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      condition: z.string(),
      points: z.coerce.number().int().min(-100).max(100),
      enabled: z.boolean(),
    })
  ),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["OWNER_ADMIN", "SALES", "PROVIDER"]),
  territoryId: z.string().optional().nullable(),
  temporaryPassword: z.string().min(8),
});
