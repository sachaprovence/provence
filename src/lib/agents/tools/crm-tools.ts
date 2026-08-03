import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Exemple d'outil catégorie "CRM" : lecture seule, agrégée, aucune écriture
 * possible. Sert de preuve du principe "même vérification de permission
 * pour les outils qui touchent des données métier" — ce n'est pas un
 * agent CRM, seulement un outil déclaratif qu'un futur agent pourra
 * utiliser (voir consigne "aucun agent métier" de la v0.3).
 */
export const leadsCountByStageTool: ToolHandler<void, { counts: Record<string, number> }> = {
  key: "crm.leads_count_by_stage",
  async handle(_input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const rows = await prisma.lead.groupBy({
      by: ["stage"],
      where: { organizationId: installation.organizationId, workspaceId: installation.workspaceId },
      _count: { _all: true },
    });

    return { counts: Object.fromEntries(rows.map((row) => [row.stage, row._count._all])) };
  },
};
