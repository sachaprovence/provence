import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { createQuote, sendQuote } from "@/lib/crm/quote-service";
import { generateAgentNarrative } from "@/lib/agents/shared/generation";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Devis (v0.9) — réutilise directement le
 * service de devis RÉEL (`@/lib/crm/quote-service`, task #83), jamais une
 * réimplémentation : créer/envoyer un devis via cet agent produit
 * exactement le même `Quote` que depuis la fiche prospect ou `/quotes`
 * (voir ADR 0038 §agents métier).
 */

export const draftQuoteTool: ToolHandler<
  { leadId: string; serviceId: string; quantity?: number; discountPercent?: number; vatRate?: number },
  { quote: unknown }
> = {
  key: "devis.draft_quote",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_FINANCE");

    const service = await prisma.service.findFirst({ where: { id: input.serviceId, organizationId: installation.organizationId, isActive: true } });
    if (!service) throw new ValidationError("Offre commerciale introuvable ou inactive.");

    const quote = await createQuote(installation.organizationId, {
      leadId: input.leadId,
      discountPercent: input.discountPercent,
      vatRate: input.vatRate,
      lines: [{ serviceId: service.id, label: service.name, quantity: input.quantity ?? 1, unitPrice: service.basePrice }],
    });

    return { quote };
  },
};

export const sendQuoteTool: ToolHandler<{ quoteId: string }, { quote: unknown }> = {
  key: "devis.send_quote",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_FINANCE");
    if (!installation.installedById) {
      throw new ValidationError("Impossible d'envoyer un devis : installation sans utilisateur associé.");
    }
    const quote = await sendQuote(installation.organizationId, input.quoteId, installation.installedById);
    return { quote };
  },
};

export const recommendPricingTool: ToolHandler<{ leadId: string }, { narrative: string }> = {
  key: "devis.recommend_pricing",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const lead = await prisma.lead.findFirst({
      where: { id: input.leadId, organizationId: installation.organizationId },
      include: { scores: { orderBy: { computedAt: "desc" }, take: 1 } },
    });
    if (!lead) throw new NotFoundError("Prospect introuvable.");

    const generated = await generateAgentNarrative({
      promptKey: "devis.recommend_pricing",
      variables: {
        establishmentName: lead.establishmentName,
        category: lead.category,
        score: String(lead.scores[0]?.value ?? "non calculé"),
      },
      scope: { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id },
      systemPrompt: "Tu es l'Agent Devis d'Autorun. Recommande des approches tarifaires adaptées, sans jamais fixer de montant toi-même.",
    });

    return { narrative: generated.text };
  },
};

export const devisTools: ToolHandler[] = [draftQuoteTool, sendQuoteTool, recommendPricingTool];
