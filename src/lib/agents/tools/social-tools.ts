import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { writeAuditLog } from "@/lib/audit";
import { generateAgentNarrative } from "@/lib/agents/shared/generation";
import { VirtualTourStatus } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Réseaux sociaux (v0.9) — la PUBLICATION
 * réelle sur les réseaux sociaux reste un stub honnête (aucune API
 * Meta/LinkedIn/TikTok disponible dans cet environnement) : cet agent
 * produit un texte de publication prêt à copier-coller pour une VRAIE
 * `VirtualTour` publiée, jamais un contenu inventé sans lien avec une
 * visite réellement livrée. Voir ADR 0038 §agents métier et §Communication
 * Hub (même distinction stub/réel).
 */

export const listRecentPublishedToursTool: ToolHandler<
  { limit?: number } | undefined,
  { tours: { id: string; establishmentName: string; category: string; tourUrl: string | null }[] }
> = {
  key: "social.list_recent_published_tours",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const tours = await prisma.virtualTour.findMany({
      where: { organizationId: installation.organizationId, status: VirtualTourStatus.PUBLISHED },
      include: { lead: { select: { establishmentName: true, category: true } } },
      orderBy: { updatedAt: "desc" },
      take: input?.limit ?? 10,
    });

    return {
      tours: tours.map((t) => ({ id: t.id, establishmentName: t.lead.establishmentName, category: t.lead.category, tourUrl: t.tourUrl })),
    };
  },
};

export const draftSocialPostTool: ToolHandler<{ virtualTourId: string }, { narrative: string }> = {
  key: "social.draft_post",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const tour = await prisma.virtualTour.findFirst({
      where: { id: input.virtualTourId, organizationId: installation.organizationId },
      include: { lead: { select: { establishmentName: true, category: true } } },
    });
    if (!tour) throw new NotFoundError("Visite 3D introuvable.");

    const generated = await generateAgentNarrative({
      promptKey: "social.draft_post",
      variables: {
        establishmentName: tour.lead.establishmentName,
        category: tour.lead.category,
        tourUrl: tour.tourUrl ?? "(lien à renseigner)",
      },
      scope: { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id },
      systemPrompt: "Tu es l'Agent Réseaux sociaux d'Autorun. Rédige des publications courtes, engageantes, jamais mensongères sur le contenu réellement livré.",
    });

    await writeAuditLog({
      organizationId: installation.organizationId,
      leadId: tour.leadId,
      action: "social_post.drafted",
      entityType: "VirtualTour",
      entityId: tour.id,
      metadata: { source: "agent:social" },
    });

    return { narrative: generated.text };
  },
};

export const socialTools: ToolHandler[] = [listRecentPublishedToursTool, draftSocialPostTool];
