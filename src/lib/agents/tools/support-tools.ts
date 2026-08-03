import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { writeAuditLog } from "@/lib/audit";
import { generateAgentNarrative } from "@/lib/agents/shared/generation";
import { MessageStatus, MessageType } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Support (v0.9) — opère sur les VRAIS
 * `Conversation`/`Message` d'un `Lead` (voir ADR 0038 §agents métier).
 * Promeut le stub `future-support-agent` (v0.4) en agent réellement
 * implémenté, même mécanisme que l'Agent Commercial (v0.5, ADR 0012).
 */

export const summarizeConversationTool: ToolHandler<{ leadId: string }, { narrative: string; messageCount: number }> = {
  key: "support.summarize_conversation",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: installation.organizationId } });
    if (!lead) throw new NotFoundError("Prospect introuvable.");

    const [conversations, messages] = await Promise.all([
      prisma.conversation.count({ where: { leadId: lead.id } }),
      prisma.message.count({ where: { leadId: lead.id, status: "SENT" } }),
    ]);
    const messageCount = conversations + messages;

    const generated = await generateAgentNarrative({
      promptKey: "support.summarize_conversation",
      variables: { establishmentName: lead.establishmentName, messageCount: String(messageCount) },
      scope: { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id },
      systemPrompt: "Tu es l'Agent Support d'Autorun. Résume les échanges de façon factuelle et utile, sans jamais inventer de contenu non présent dans l'historique.",
    });

    return { narrative: generated.text, messageCount };
  },
};

export const draftSupportReplyTool: ToolHandler<{ leadId: string }, { message: unknown; narrative: string }> = {
  key: "support.draft_reply",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");

    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: installation.organizationId } });
    if (!lead) throw new NotFoundError("Prospect introuvable.");

    const lastInbound = await prisma.conversation.findFirst({
      where: { leadId: lead.id, direction: "inbound" },
      orderBy: { createdAt: "desc" },
    });
    if (!lastInbound) throw new ValidationError("Aucun message entrant à traiter pour ce prospect.");

    const generated = await generateAgentNarrative({
      promptKey: "support.draft_reply",
      variables: { establishmentName: lead.establishmentName, lastMessageBody: lastInbound.body },
      scope: { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id },
      systemPrompt: "Tu es l'Agent Support d'Autorun. Rédige des réponses professionnelles, utiles et concises.",
    });

    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        type: MessageType.FOLLOW_UP_SHORT,
        subject: lastInbound.subject ? `Re: ${lastInbound.subject}` : "Réponse à votre message",
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
      metadata: { source: "agent:support", promptKey: generated.promptKey },
    });

    return { message, narrative: generated.text };
  },
};

export const supportTools: ToolHandler[] = [summarizeConversationTool, draftSupportReplyTool];
