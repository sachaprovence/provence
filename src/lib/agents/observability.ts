import "server-only";
import { prisma } from "@/lib/prisma";
import { AgentRunStatus } from "@/generated/prisma/enums";

/**
 * Statistiques d'observabilité calculées à la lecture (pas de table de
 * métriques dédiée à ce stade — prématuré sans agent métier réel pour en
 * mesurer le besoin réel). Coût IA agrégé via `AIRequest.agentRunId`
 * (voir migration `add_agent_framework`), sans dupliquer le suivi de coût
 * déjà existant.
 */
export async function getInstallationStats(installationId: string) {
  const [statusCounts, durationAgg, costAgg, lastRun] = await Promise.all([
    prisma.agentRun.groupBy({ by: ["status"], where: { installationId }, _count: { _all: true } }),
    prisma.$queryRaw<{ avg_ms: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000) AS avg_ms
      FROM "AgentRun"
      WHERE "installationId" = ${installationId} AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL
    `,
    prisma.aIRequest.aggregate({
      where: { agentRun: { installationId } },
      _sum: { estimatedCostUsd: true },
      _count: { _all: true },
    }),
    prisma.agentRun.findFirst({ where: { installationId }, orderBy: { createdAt: "desc" } }),
  ]);

  const counts = Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])) as Partial<
    Record<AgentRunStatus, number>
  >;
  const totalRuns = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const succeeded = counts.SUCCEEDED ?? 0;
  const failed = (counts.FAILED ?? 0) + (counts.TIMED_OUT ?? 0);

  return {
    totalRuns,
    byStatus: counts,
    successRate: totalRuns > 0 ? succeeded / totalRuns : null,
    failureRate: totalRuns > 0 ? failed / totalRuns : null,
    averageDurationMs: durationAgg[0]?.avg_ms ?? null,
    aiRequestCount: costAgg._count._all,
    estimatedAiCostUsd: costAgg._sum.estimatedCostUsd ?? 0,
    lastRunAt: lastRun?.createdAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
  };
}

export async function listRunLogs(runId: string) {
  return prisma.agentRunLog.findMany({ where: { runId }, orderBy: { createdAt: "asc" } });
}

export async function listRunsForInstallation(installationId: string, limit = 50) {
  return prisma.agentRun.findMany({
    where: { installationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
