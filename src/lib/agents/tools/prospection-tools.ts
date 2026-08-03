import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { computeScore, DEFAULT_SCORING_RULES, type ScoringRule } from "@/lib/scoring";
import { LAUNCH_ZONES } from "@/lib/bootstrap";
import { isSuppressed } from "@/lib/suppression";
import { onLeadScoreComputed } from "@/lib/automation-engine";
import { writeAuditLog } from "@/lib/audit";
import { generateAgentNarrative } from "@/lib/agents/shared/generation";
import { LeadStage, MessageStatus, MessageType } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Prospection (v0.9) — opère sur les VRAIES
 * données CRM (`Lead`/`LeadScore`/`Message`), jamais un modèle séparé de
 * démonstration (contrairement à `CommercialProspect`, propre à l'Agent
 * Commercial v0.5 et non connecté au reste de l'application) : voir ADR
 * 0038 §agents métier. Réutilise le moteur de scoring réel
 * (`@/lib/scoring`, celui utilisé par `/api/leads/[id]/score`), jamais le
 * moteur de démonstration de l'Agent Commercial.
 */

export const findPriorityLeadsTool: ToolHandler<
  { limit?: number } | undefined,
  { leads: { id: string; establishmentName: string; category: string; city: string | null; score: number | null }[] }
> = {
  key: "prospection.find_priority_leads",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const leads = await prisma.lead.findMany({
      where: { organizationId: installation.organizationId, stage: { in: [LeadStage.NEW, LeadStage.TO_ANALYZE] }, isSuppressed: false },
      include: { scores: { orderBy: { computedAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: input?.limit ?? 20,
    });

    const sorted = leads
      .map((lead) => ({
        id: lead.id,
        establishmentName: lead.establishmentName,
        category: lead.category,
        city: lead.city,
        score: lead.scores[0]?.value ?? null,
      }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    return { leads: sorted };
  },
};

export const scoreLeadTool: ToolHandler<{ leadId: string }, { score: number; category: string }> = {
  key: "prospection.score_lead",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");

    const lead = await prisma.lead.findFirst({
      where: { id: input.leadId, organizationId: installation.organizationId },
      include: { contacts: true, territory: true },
    });
    if (!lead) throw new NotFoundError("Prospect introuvable.");

    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: installation.organizationId } });
    const rules = (organization.scoringRules as unknown as ScoringRule[] | null) ?? DEFAULT_SCORING_RULES;

    const primaryEmail = lead.contacts.find((c) => c.email)?.email ?? null;
    const suppressed = lead.isSuppressed || (await isSuppressed(installation.organizationId, primaryEmail));
    const lastMessage = await prisma.message.findFirst({ where: { leadId: lead.id, status: "SENT" }, orderBy: { sentAt: "desc" } });
    const recentlyContactedDays = lastMessage?.sentAt
      ? Math.floor((Date.now() - lastMessage.sentAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const result = computeScore(
      {
        establishmentName: lead.establishmentName,
        category: lead.category,
        hasVirtualTour: lead.hasVirtualTour,
        reviewCount: lead.reviewCount,
        averageRating: lead.averageRating,
        websiteUrl: lead.websiteUrl,
        socialLinks: (lead.socialLinks as Record<string, string> | null) ?? null,
        address: lead.address,
        inZone: lead.territory ? LAUNCH_ZONES.includes(lead.territory.name) : Boolean(lead.city && LAUNCH_ZONES.includes(lead.city)),
        recentlyContactedDays,
        isSuppressed: suppressed,
        closedBusiness: lead.closedBusiness,
      },
      rules
    );

    await prisma.leadScore.create({ data: { leadId: lead.id, value: result.value, category: result.category, breakdown: result.breakdown as never } });
    await onLeadScoreComputed(lead.id, installation.organizationId, result.value);
    await writeAuditLog({
      organizationId: installation.organizationId,
      leadId: lead.id,
      action: "lead.scored",
      entityType: "LeadScore",
      metadata: { value: result.value, category: result.category, source: "agent:prospection" },
    });

    return { score: result.value, category: result.category };
  },
};

export const draftOutreachTool: ToolHandler<{ leadId: string }, { message: unknown; narrative: string }> = {
  key: "prospection.draft_outreach",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");

    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: installation.organizationId } });
    if (!lead) throw new NotFoundError("Prospect introuvable.");

    const generated = await generateAgentNarrative({
      promptKey: "prospection.draft_outreach",
      variables: { establishmentName: lead.establishmentName, category: lead.category, city: lead.city ?? "non renseignée" },
      scope: { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id },
      systemPrompt: "Tu es l'Agent Prospection d'Autorun. Rédige des messages de prise de contact professionnels et personnalisés.",
    });

    // Jamais envoyé automatiquement (ADR 0017) : statut PENDING_VALIDATION, un humain valide avant envoi réel.
    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        type: MessageType.FIRST_CONTACT_EMAIL,
        subject: `Découvrez la visite virtuelle 360° — ${lead.establishmentName}`,
        body: generated.text,
        status: MessageStatus.PENDING_VALIDATION,
      },
    });

    await writeAuditLog({
      organizationId: installation.organizationId,
      leadId: lead.id,
      action: "message.drafted",
      entityType: "Message",
      entityId: message.id,
      metadata: { source: "agent:prospection", promptKey: generated.promptKey },
    });

    return { message, narrative: generated.text };
  },
};

export const prospectionTools: ToolHandler[] = [findPriorityLeadsTool, scoreLeadTool, draftOutreachTool];
