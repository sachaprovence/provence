import "server-only";
import { prisma } from "@/lib/prisma";
import type { WorkflowRunStatus } from "@/generated/prisma/client";

/** Même précaution que `agents/observability.ts` : forcer un `number` JS ordinaire, `AVG()` pouvant renvoyer un `Prisma.Decimal`. */
function toPlainNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

/**
 * Tableau de bord du Workflow Engine (voir brief v0.6) : workflows actifs/
 * inactifs, historique, temps d'exécution, erreurs/succès, files
 * d'attente, exécutions en cours, goulots d'étranglement — mêmes
 * conventions d'agrégation que `agents/observability.ts` (v0.3/v0.4).
 */
export async function getWorkflowDashboard(workspaceId: string) {
  const [definitionsByStatus, definitions, runsByStatus, durationAgg, recentRuns, bottlenecks] = await Promise.all([
    prisma.workflowDefinition.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    prisma.workflowDefinition.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
    prisma.workflowRun.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    prisma.$queryRaw<{ avg_ms: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000)::float8 AS avg_ms
      FROM "WorkflowRun"
      WHERE "workspaceId" = ${workspaceId} AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL
    `,
    prisma.workflowRun.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { workflowDefinition: { select: { name: true, key: true } } },
    }),
    prisma.$queryRaw<{ nodeType: string; actionKey: string | null; total: number; failed: number; avg_ms: number | null }[]>`
      SELECT s."nodeType" AS "nodeType", s."actionKey" AS "actionKey",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.status = 'FAILED')::int AS failed,
        AVG(EXTRACT(EPOCH FROM (s."finishedAt" - s."startedAt")) * 1000)::float8 AS avg_ms
      FROM "WorkflowRunStep" s
      JOIN "WorkflowRun" r ON r.id = s."runId"
      WHERE r."workspaceId" = ${workspaceId} AND s."startedAt" IS NOT NULL AND s."finishedAt" IS NOT NULL
      GROUP BY s."nodeType", s."actionKey"
      ORDER BY avg_ms DESC NULLS LAST
      LIMIT 10
    `,
  ]);

  const statusCounts = Object.fromEntries(definitionsByStatus.map((row) => [row.status, row._count._all])) as Partial<
    Record<string, number>
  >;
  const runCounts = Object.fromEntries(runsByStatus.map((row) => [row.status, row._count._all])) as Partial<
    Record<WorkflowRunStatus, number>
  >;
  const totalRuns = runsByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const succeeded = runCounts.SUCCEEDED ?? 0;
  const failed = (runCounts.FAILED ?? 0) + (runCounts.TIMED_OUT ?? 0);

  return {
    definitions,
    definitionCounts: {
      active: statusCounts.ACTIVE ?? 0,
      inactive: statusCounts.INACTIVE ?? 0,
      draft: statusCounts.DRAFT ?? 0,
      archived: statusCounts.ARCHIVED ?? 0,
    },
    runCounts: {
      queued: runCounts.QUEUED ?? 0,
      running: runCounts.RUNNING ?? 0,
      waiting: runCounts.WAITING ?? 0,
      succeeded,
      failed,
      cancelled: runCounts.CANCELLED ?? 0,
      total: totalRuns,
    },
    successRate: totalRuns > 0 ? succeeded / totalRuns : null,
    failureRate: totalRuns > 0 ? failed / totalRuns : null,
    averageDurationMs: toPlainNumberOrNull(durationAgg[0]?.avg_ms),
    recentRuns,
    bottlenecks: bottlenecks.map((row) => ({
      nodeType: row.nodeType,
      actionKey: row.actionKey,
      total: row.total,
      failed: row.failed,
      failureRate: row.total > 0 ? row.failed / row.total : 0,
      averageDurationMs: toPlainNumberOrNull(row.avg_ms),
    })),
  };
}
