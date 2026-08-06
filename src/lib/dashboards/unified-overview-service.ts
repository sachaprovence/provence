import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkflowDashboard } from "@/lib/workflows/dashboard-service";
import { getAutomationDashboard } from "@/lib/automation/dashboard-service";
import { getObservabilityMetrics, defaultMetricsRange } from "@/lib/observability/metrics-service";
import { getUnifiedConnectorsView } from "@/lib/integrations/connectors-service";
import { countUnreadNotifications } from "@/lib/notifications/notification-service";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Vue d'ensemble consolidée (v1.6, mission "Dashboard complet") : workflows,
 * agents (personnalisés + Framework), automatisations, exécutions, mémoire,
 * connecteurs, coûts IA, erreurs, notifications — sur une seule page. Ne
 * recalcule rien : agrège des services déjà existants (dashboards
 * Workflow/Automation Engine v0.6/v0.8, métriques d'observabilité v1.3,
 * écran Connecteurs v1.6, notifications v1.4), jamais une seconde source
 * de vérité pour un chiffre déjà produit ailleurs.
 */
export async function getUnifiedOverview(actor: WorkspaceActor) {
  const range = defaultMetricsRange();

  const [workflowDashboard, automationDashboard, observability, connectors, unreadNotifications, customAgentsCount, memoryEntriesCount] =
    await Promise.all([
      getWorkflowDashboard(actor.workspace.id),
      getAutomationDashboard(actor.workspace.id),
      getObservabilityMetrics(actor.organization.id, range),
      getUnifiedConnectorsView(actor),
      countUnreadNotifications(actor),
      prisma.customAgent.count({ where: { workspaceId: actor.workspace.id, archivedAt: null } }),
      prisma.memoryEntry.count({ where: { organizationId: actor.organization.id, isCurrent: true, archivedAt: null } }),
    ]);

  const connectedCount = [connectors.gmail.status, connectors.calendar.status, connectors.slack.status, connectors.discord.status].filter(
    (s) => s === "CONNECTED"
  ).length;

  return {
    workflows: {
      active: workflowDashboard.definitionCounts.active,
      total: workflowDashboard.definitions.length,
      recentRuns: workflowDashboard.recentRuns.length,
    },
    automations: {
      active: automationDashboard.automations.counts.active,
      total: automationDashboard.automations.counts.total,
      recentRuns: automationDashboard.runs.recent.length,
    },
    agents: {
      custom: customAgentsCount,
    },
    memory: {
      entries: memoryEntriesCount,
    },
    connectors: {
      connected: connectedCount,
      total: 4,
    },
    aiCost: {
      totalCostUsd: observability.ai.totalCostUsd,
      requestCount: observability.ai.requestCount,
    },
    errors: {
      errorCount: observability.apiLatency.errorCount,
      errorRate: observability.apiLatency.errorRate,
    },
    notifications: {
      unread: unreadNotifications,
    },
  };
}
