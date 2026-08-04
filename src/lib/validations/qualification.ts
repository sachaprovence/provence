import { z } from "zod";

const prospectFactsSchema = z
  .object({
    companySize: z.string().optional(),
    sector: z.string().optional(),
    website: z.string().optional(),
    googlePresenceScore: z.number().optional(),
    socialPresenceCount: z.number().optional(),
    previousInteractionsCount: z.number().optional(),
    potentialEstimateValue: z.number().optional(),
    conversionProbabilityHint: z.number().optional(),
  })
  .partial();

/** Entrée du runtime `qualification.qualification-agent` (v1.1, AR-0173). */
export const qualificationAgentInputSchema = z.object({
  prospectId: z.string().min(1, "prospectId est requis."),
  notes: z.string().optional(),
  facts: prospectFactsSchema.optional(),
});

export type QualificationAgentInput = z.infer<typeof qualificationAgentInputSchema>;
