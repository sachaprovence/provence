import "server-only";
import { prisma } from "@/lib/prisma";
import { AgentRunStatus } from "@/generated/prisma/enums";

/**
 * `AVG()` sur une expression dérivée d'un intervalle peut renvoyer un
 * `numeric` Postgres selon le contexte, que Prisma mappe alors vers
 * `Prisma.Decimal` plutôt qu'un `number` JS — un `Decimal` ne peut pas être
 * sérialisé tel quel vers un Client Component ("Only plain objects can be
 * passed..."). On force donc systématiquement un `number` JS ordinaire ici,
 * quel que soit le type réellement renvoyé par le driver.
 */
function toPlainNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

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
      SELECT AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000)::float8 AS avg_ms
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
    averageDurationMs: toPlainNumberOrNull(durationAgg[0]?.avg_ms),
    aiRequestCount: costAgg._count._all,
    estimatedAiCostUsd: toPlainNumberOrNull(costAgg._sum.estimatedCostUsd) ?? 0,
    lastRunAt: lastRun?.createdAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
  };
}

/**
 * Mêmes agrégats que `getInstallationStats`, mais à l'échelle du workspace
 * (toutes les installations confondues) — utilisé par le tableau de bord du
 * Director (v0.4) pour la consommation/performance globale, sans dupliquer
 * la logique de calcul.
 */
export async function getWorkspaceAgentStats(workspaceId: string) {
  const [statusCounts, durationAgg, costAgg] = await Promise.all([
    prisma.agentRun.groupBy({ by: ["status"], where: { installation: { workspaceId } }, _count: { _all: true } }),
    prisma.$queryRaw<{ avg_ms: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (r."finishedAt" - r."startedAt")) * 1000)::float8 AS avg_ms
      FROM "AgentRun" r
      JOIN "AgentInstallation" i ON i.id = r."installationId"
      WHERE i."workspaceId" = ${workspaceId} AND r."startedAt" IS NOT NULL AND r."finishedAt" IS NOT NULL
    `,
    prisma.aIRequest.aggregate({
      where: { agentRun: { installation: { workspaceId } } },
      _sum: { estimatedCostUsd: true },
      _count: { _all: true },
    }),
  ]);

  const counts = Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])) as Partial<
    Record<AgentRunStatus, number>
  >;
  const totalRuns = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

  return {
    totalRuns,
    byStatus: counts,
    averageDurationMs: toPlainNumberOrNull(durationAgg[0]?.avg_ms),
    aiRequestCount: costAgg._count._all,
    estimatedAiCostUsd: toPlainNumberOrNull(costAgg._sum.estimatedCostUsd) ?? 0,
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
