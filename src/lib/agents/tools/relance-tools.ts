import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { writeAuditLog } from "@/lib/audit";
import { generateAgentNarrative } from "@/lib/agents/shared/generation";
import { LeadStage, MessageStatus, MessageType } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Relance (v0.9) — opère sur les VRAIS
 * `Lead`/`Message` (voir ADR 0038 §agents métier, même principe que
 * `prospection-tools.ts` : jamais un modèle séparé de démonstration).
 * Complémentaire du moteur de séquences (`sequence-engine.ts`) : celui-ci
 * gère les relances AUTOMATIQUES programmées dans une séquence active,
 * l'Agent Relance identifie et relance PONCTUELLEMENT les prospects
 * restés sans réponse en dehors de toute séquence.
 */

const STALE_STAGES = [LeadStage.CONTACTED, LeadStage.FOLLOW_UP_SCHEDULED, LeadStage.REPLIED];

export const findStaleLeadsTool: ToolHandler<
  { staleAfterDays?: number; limit?: number } | undefined,
  { leads: { id: string; establishmentName: string; stage: string; daysSinceLastMessage: number }[] }
> = {
  key: "relance.find_stale_leads",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");
    const staleAfterDays = input?.staleAfterDays ?? 5;
    const threshold = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000);

    const leads = await prisma.lead.findMany({
      where: { organizationId: installation.organizationId, stage: { in: STALE_STAGES }, isSuppressed: false },
      include: { messages: { orderBy: { sentAt: "desc" }, take: 1, where: { status: "SENT" } } },
      take: input?.limit ?? 50,
    });

    const stale = leads
      .filter((lead) => {
        const lastSentAt = lead.messages[0]?.sentAt;
        return !lastSentAt || lastSentAt <= threshold;
      })
      .map((lead) => ({
        id: lead.id,
        establishmentName: lead.establishmentName,
        stage: lead.stage,
        daysSinceLastMessage: lead.messages[0]?.sentAt
          ? Math.floor((Date.now() - lead.messages[0].sentAt.getTime()) / (1000 * 60 * 60 * 24))
          : Infinity,
      }));

    return { leads: stale };
  },
};

export const draftFollowUpTool: ToolHandler<{ leadId: string }, { message: unknown; narrative: string }> = {
  key: "relance.draft_followup",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");

    const lead = await prisma.lead.findFirst({
      where: { id: input.leadId, organizationId: installation.organizationId },
      include: { messages: { orderBy: { sentAt: "desc" }, take: 1, where: { status: "SENT" } } },
    });
    if (!lead) throw new NotFoundError("Prospect introuvable.");

    const daysSinceLastContact = lead.messages[0]?.sentAt
      ? Math.floor((Date.now() - lead.messages[0].sentAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const generated = await generateAgentNarrative({
      promptKey: "relance.draft_followup",
      variables: { establishmentName: lead.establishmentName, stage: lead.stage, daysSinceLastContact: String(daysSinceLastContact) },
      scope: { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id },
      systemPrompt: "Tu es l'Agent Relance d'Autorun. Rédige des relances courtes, cordiales et jamais insistantes.",
    });

    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        type: MessageType.FOLLOW_UP_SHORT,
        subject: `Toujours partant·e, ${lead.establishmentName} ?`,
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
      metadata: { source: "agent:relance", promptKey: generated.promptKey },
    });

    return { message, narrative: generated.text };
  },
};

export const relanceTools: ToolHandler[] = [findStaleLeadsTool, draftFollowUpTool];
