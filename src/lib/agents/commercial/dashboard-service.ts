import "server-only";
import { prisma } from "@/lib/prisma";
import type { CommercialStage } from "@/generated/prisma/enums";

/**
 * Agrégations pour le tableau de bord de l'Agent Commercial (v0.5) — même
 * principe que `director/dashboard-service.ts` (v0.4) : tout est calculé à
 * la lecture depuis les tables existantes, aucune table de métriques
 * dédiée.
 */
export async function getCommercialDashboard(workspaceId: string) {
  const [stageCounts, pendingActions, recentActions, prospects] = await Promise.all([
    prisma.commercialProspect.groupBy({ by: ["stage"], where: { workspaceId }, _count: { _all: true } }),
    prisma.commercialAction.findMany({
      where: { workspaceId, status: "PENDING_APPROVAL" },
      orderBy: { createdAt: "desc" },
      include: { prospect: true },
    }),
    prisma.commercialAction.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { prospect: true },
    }),
    prisma.commercialProspect.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
  ]);

  const byStage = Object.fromEntries(stageCounts.map((row) => [row.stage, row._count._all])) as Partial<
    Record<CommercialStage, number>
  >;

  return { byStage, pendingActions, recentActions, prospects };
}
