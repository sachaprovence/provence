import { z } from "zod";

const commercialStageSchema = z.enum([
  "NEW",
  "TO_QUALIFY",
  "QUALIFIED",
  "FIRST_CONTACT",
  "FOLLOW_UP",
  "MEETING",
  "QUOTE_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
]);

const createProspectDataSchema = z.object({
  companyName: z.string().min(1),
  sector: z.string().optional(),
  companySize: z.string().optional(),
  website: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  source: z.string().optional(),
});

const ACTIONS_REQUIRING_PROSPECT_ID = [
  "enrich_prospect",
  "qualify_prospect",
  "score_prospect",
  "estimate_potential",
  "draft_email",
  "draft_followup",
  "draft_proposal",
  "draft_quote",
  "recommend_next_actions",
] as const;

/** Entrée du runtime `commercial.sales-agent` — une action explicite à exécuter, ou `full_cycle` pour enchaîner tout le cycle sur un nouveau prospect. */
export const commercialAgentInputSchema = z
  .object({
    action: z.enum([
      "create_prospect",
      "search_prospects",
      "enrich_prospect",
      "qualify_prospect",
      "score_prospect",
      "estimate_potential",
      "draft_email",
      "draft_followup",
      "draft_proposal",
      "draft_quote",
      "recommend_next_actions",
      "full_cycle",
    ]),
    prospectId: z.string().optional(),
    stage: commercialStageSchema.optional(),
    notes: z.string().optional(),
    query: z.string().optional(),
    previousSummary: z.string().optional(),
    objection: z.string().optional(),
    data: createProspectDataSchema.partial().optional(),
    quote: z.object({ amount: z.number(), currency: z.string().optional() }).optional(),
  })
  .superRefine((value, ctx) => {
    if ((ACTIONS_REQUIRING_PROSPECT_ID as readonly string[]).includes(value.action) && !value.prospectId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `prospectId est requis pour l'action "${value.action}".` });
    }
    if (value.action === "qualify_prospect" && !value.stage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "stage est requis pour l'action qualify_prospect." });
    }
    if (value.action === "draft_quote" && !value.quote) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "quote (montant) est requis pour l'action draft_quote." });
    }
    if ((value.action === "create_prospect" || value.action === "full_cycle") && !value.data?.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `data.companyName est requis pour l'action "${value.action}".`,
      });
    }
  });

export type CommercialAgentInput = z.infer<typeof commercialAgentInputSchema>;

export const decideCommercialActionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
});
