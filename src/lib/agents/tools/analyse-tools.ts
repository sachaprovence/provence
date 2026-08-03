import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { getOrgStats, defaultStatsRange } from "@/lib/stats";
import { generateAgentNarrative } from "@/lib/agents/shared/generation";
import { LeadStage } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Analyse (v0.9) — réutilise les VRAIES
 * statistiques déjà calculées (`@/lib/stats`, alimentent `/dashboard`),
 * jamais un recalcul séparé. Promeut le stub `future-analyse-agent`
 * (v0.4) en agent réellement implémenté (ADR 0012).
 */

const STALLED_STAGES = [
  LeadStage.NEW,
  LeadStage.TO_ANALYZE,
  LeadStage.QUALIFIED,
  LeadStage.CONTACTED,
  LeadStage.FOLLOW_UP_SCHEDULED,
  LeadStage.REPLIED,
  LeadStage.INTERESTED,
  LeadStage.APPOINTMENT_SCHEDULED,
  LeadStage.QUOTE_SENT,
  LeadStage.NEGOTIATION,
];

export const generateReportTool: ToolHandler<{ days?: number } | undefined, { stats: unknown; narrative: string }> = {
  key: "analyse.generate_report",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const { from, to } = defaultStatsRange(input?.days ?? 90);
    const stats = await getOrgStats(installation.organizationId, from, to);

    const generated = await generateAgentNarrative({
      promptKey: "analyse.generate_report",
      variables: {
        newLeads: String(stats.kpis.newLeads),
        customersWon: String(stats.kpis.customersWon),
        revenueGenerated: (stats.kpis.revenueGenerated / 100).toFixed(0),
        conversionRate: String(Math.round(stats.kpis.conversionRate * 100)),
      },
      scope: { organizationId: installation.organizationId, workspaceId: installation.workspaceId, agentScopeId: installation.id },
      systemPrompt: "Tu es l'Agent Analyse d'Autorun. Rédige des synthèses factuelles basées uniquement sur les chiffres fournis, jamais inventés.",
    });

    return { stats, narrative: generated.text };
  },
};

export const detectStalledLeadsTool: ToolHandler<
  { staleAfterDays?: number; limit?: number } | undefined,
  { leads: { id: string; establishmentName: string; stage: string; daysSinceUpdate: number }[] }
> = {
  key: "analyse.detect_stalled_leads",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");
    const staleAfterDays = input?.staleAfterDays ?? 14;
    const threshold = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000);

    const leads = await prisma.lead.findMany({
      where: { organizationId: installation.organizationId, stage: { in: STALLED_STAGES }, updatedAt: { lte: threshold }, isSuppressed: false },
      orderBy: { updatedAt: "asc" },
      take: input?.limit ?? 50,
    });

    return {
      leads: leads.map((lead) => ({
        id: lead.id,
        establishmentName: lead.establishmentName,
        stage: lead.stage,
        daysSinceUpdate: Math.floor((Date.now() - lead.updatedAt.getTime()) / (1000 * 60 * 60 * 24)),
      })),
    };
  },
};

export const analyseTools: ToolHandler[] = [generateReportTool, detectStalledLeadsTool];
