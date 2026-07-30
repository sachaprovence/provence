import "server-only";
import { NotFoundError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import {
  createProspect,
  searchProspects,
  enrichProspect,
  qualifyProspect,
  recordScore,
  recordPotentialEstimate,
  createAction,
  type CreateProspectInput,
  type EnrichProspectInput,
} from "@/lib/agents/commercial/commercial-service";
import { computeScore, registerBuiltInScoringFactors, type ProspectFacts } from "@/lib/agents/commercial/scoring-engine";
import { generateNarrative } from "@/lib/agents/commercial/generation";
import { recordObjection, listObjections } from "@/lib/agents/commercial/memory";
import { CommercialActionType, CommercialStage } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Les 11 outils déclaratifs de l'Agent Commercial (v0.5), un par capacité
 * demandée (rechercher/qualifier/enrichir/estimer/créer/scorer/rédiger un
 * email/relancer/proposer/devis/recommander). Chacun vérifie la
 * permission de workspace appropriée en plus du plafond d'outils de
 * l'installation (`requireAgentToolPermission`, déjà appliqué par
 * `context.callTool` avant d'invoquer le handler) — même principe que
 * `crm.leads_count_by_stage` (v0.3).
 */

const COMPANY_SIZE_POTENTIAL: Record<string, number> = {
  "1-9": 800,
  "10-49": 3000,
  "50-249": 12000,
  "250+": 40000,
};

export const createProspectTool: ToolHandler<CreateProspectInput, { prospect: unknown }> = {
  key: "commercial.create_prospect",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    const prospect = await createProspect(installation, input);
    return { prospect };
  },
};

export const searchProspectsTool: ToolHandler<{ stage?: CommercialStage; query?: string } | undefined, { prospects: unknown[] }> = {
  key: "commercial.search_prospects",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");
    const prospects = await searchProspects(installation, input ?? {});
    return { prospects };
  },
};

export const enrichProspectTool: ToolHandler<{ prospectId: string } & EnrichProspectInput, { prospect: unknown }> = {
  key: "commercial.enrich_prospect",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    const { prospectId, ...patch } = input;
    const prospect = await enrichProspect(installation, prospectId, patch);
    return { prospect };
  },
};

export const qualifyProspectTool: ToolHandler<{ prospectId: string; stage: CommercialStage; notes?: string }, { prospect: unknown }> = {
  key: "commercial.qualify_prospect",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    const prospect = await qualifyProspect(installation, input.prospectId, { stage: input.stage, notes: input.notes });
    return { prospect };
  },
};

export const scoreProspectTool: ToolHandler<
  { prospectId: string; facts?: Partial<ProspectFacts> },
  { score: number; breakdown: unknown }
> = {
  key: "commercial.score_prospect",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    registerBuiltInScoringFactors(); // défensif — voir ADR 0013 (même principe pour le registre de facteurs de scoring).
    const prospects = await searchProspects(installation, {});
    const prospect = prospects.find((p) => p.id === input.prospectId);
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    const potential = prospect.potentialEstimate as { value?: number } | null;
    const facts: ProspectFacts = {
      companySize: prospect.companySize,
      sector: prospect.sector,
      website: prospect.website,
      potentialEstimateValue: potential?.value ?? null,
      ...input.facts,
    };

    const { total, breakdown } = computeScore(facts);
    await recordScore(installation, input.prospectId, total, breakdown);
    return { score: total, breakdown };
  },
};

export const estimatePotentialTool: ToolHandler<{ prospectId: string }, { potential: unknown; narrative: string }> = {
  key: "commercial.estimate_potential",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    const prospects = await searchProspects(installation, {});
    const prospect = prospects.find((p) => p.id === input.prospectId);
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    const value = COMPANY_SIZE_POTENTIAL[prospect.companySize ?? ""] ?? 1500;
    const generated = await generateNarrative(
      "commercial.estimate_potential",
      {
        companyName: prospect.companyName,
        sector: prospect.sector ?? "non renseigné",
        companySize: prospect.companySize ?? "non renseignée",
      },
      { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id }
    );

    const potential = { value, currency: "EUR", rationale: generated.text };
    await recordPotentialEstimate(installation, input.prospectId, potential);
    return { potential, narrative: generated.text };
  },
};

export const draftEmailTool: ToolHandler<{ prospectId: string }, { action: unknown }> = {
  key: "commercial.draft_email",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    const prospects = await searchProspects(installation, {});
    const prospect = prospects.find((p) => p.id === input.prospectId);
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    const generated = await generateNarrative(
      "commercial.draft_email",
      {
        companyName: prospect.companyName,
        sector: prospect.sector ?? "non renseigné",
        contactName: prospect.contactName ?? "Madame, Monsieur",
      },
      { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id }
    );

    const action = await createAction(installation, {
      prospectId: prospect.id,
      type: CommercialActionType.EMAIL_DRAFT,
      title: `Premier email — ${prospect.companyName}`,
      payload: { subject: `Faisons connaissance — ${prospect.companyName}`, body: generated.text },
      reasoning: `Généré via le prompt "${generated.promptKey}" v${generated.promptVersion} (${generated.provider}/${generated.model}).`,
    });
    return { action };
  },
};

export const draftFollowUpTool: ToolHandler<
  { prospectId: string; previousSummary?: string; objection?: string },
  { action: unknown }
> = {
  key: "commercial.draft_followup",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    const prospects = await searchProspects(installation, {});
    const prospect = prospects.find((p) => p.id === input.prospectId);
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    // La mémoire commerciale retient les objections reçues (voir
    // `commercial/memory.ts`) — une relance qui répond à une objection
    // connue en tient compte dans le texte généré.
    if (input.objection) {
      await recordObjection(installation, prospect.id, input.objection);
    }
    const knownObjections = await listObjections(installation, prospect.id);
    const previousSummary =
      input.previousSummary ??
      (knownObjections.length > 0
        ? `Objection(s) reçue(s) précédemment : ${knownObjections.map((o) => o.objection).join(" ; ")}.`
        : "aucun échange préalable connu");

    const generated = await generateNarrative(
      "commercial.draft_followup",
      { companyName: prospect.companyName, previousSummary },
      { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id }
    );

    const action = await createAction(installation, {
      prospectId: prospect.id,
      type: CommercialActionType.FOLLOW_UP,
      title: `Relance — ${prospect.companyName}`,
      payload: { subject: `Toujours partant·e, ${prospect.companyName} ?`, body: generated.text },
      reasoning: `Généré via le prompt "${generated.promptKey}" v${generated.promptVersion}.`,
    });
    return { action };
  },
};

export const draftProposalTool: ToolHandler<{ prospectId: string }, { action: unknown }> = {
  key: "commercial.draft_proposal",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    const prospects = await searchProspects(installation, {});
    const prospect = prospects.find((p) => p.id === input.prospectId);
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    const potential = prospect.potentialEstimate as { value?: number } | null;
    const generated = await generateNarrative(
      "commercial.draft_proposal",
      {
        companyName: prospect.companyName,
        sector: prospect.sector ?? "non renseigné",
        potential: potential?.value ? String(potential.value) : "non estimé",
      },
      { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id }
    );

    const action = await createAction(installation, {
      prospectId: prospect.id,
      type: CommercialActionType.PROPOSAL,
      title: `Proposition commerciale — ${prospect.companyName}`,
      payload: { body: generated.text },
      reasoning: `Généré via le prompt "${generated.promptKey}" v${generated.promptVersion}.`,
    });
    return { action };
  },
};

export const draftQuoteTool: ToolHandler<
  { prospectId: string; amount: number; currency?: string; lineItems?: { label: string; amount: number }[] },
  { action: unknown }
> = {
  key: "commercial.draft_quote",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");
    await requireAgentWorkspacePermission(installation, "MANAGE_FINANCE");
    const prospects = await searchProspects(installation, {});
    const prospect = prospects.find((p) => p.id === input.prospectId);
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    const action = await createAction(installation, {
      prospectId: prospect.id,
      type: CommercialActionType.QUOTE_DRAFT,
      title: `Devis — ${prospect.companyName}`,
      payload: {
        amount: input.amount,
        currency: input.currency ?? "EUR",
        lineItems: input.lineItems ?? [{ label: "Prestation", amount: input.amount }],
      },
      reasoning: `Montant proposé sur la base du potentiel estimé du prospect.`,
    });
    return { action };
  },
};

export const recommendNextActionsTool: ToolHandler<{ prospectId: string }, { action: unknown }> = {
  key: "commercial.recommend_next_actions",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");
    const prospects = await searchProspects(installation, {});
    const prospect = prospects.find((p) => p.id === input.prospectId);
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    const generated = await generateNarrative(
      "commercial.recommend_next_actions",
      {
        companyName: prospect.companyName,
        stage: prospect.stage,
        score: String(prospect.score ?? "non calculé"),
      },
      { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id }
    );

    const action = await createAction(installation, {
      prospectId: prospect.id,
      type: CommercialActionType.RECOMMENDATION,
      title: `Prochaines actions — ${prospect.companyName}`,
      payload: { recommendation: generated.text },
      reasoning: `Généré via le prompt "${generated.promptKey}" v${generated.promptVersion}.`,
    });
    return { action };
  },
};

export const commercialTools: ToolHandler[] = [
  createProspectTool,
  searchProspectsTool,
  enrichProspectTool,
  qualifyProspectTool,
  scoreProspectTool,
  estimatePotentialTool,
  draftEmailTool,
  draftFollowUpTool,
  draftProposalTool,
  draftQuoteTool,
  recommendNextActionsTool,
];
