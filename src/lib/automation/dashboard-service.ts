import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkerPoolSize } from "./concurrency";

/** Même précaution que `workflows/dashboard-service.ts`/`knowledge/dashboard-service.ts` : forcer un `number` JS ordinaire, `AVG()`/`MIN()`/`MAX()` pouvant renvoyer un `Prisma.Decimal`. */
function toPlainNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

/** Un worker est considéré "actif" s'il a réclamé un job dans la fenêtre récente — heuristique honnête (aucun registre de workers vivants n'existe, voir ADR 0036), jamais un nombre inventé. */
const ACTIVE_WORKER_WINDOW_MS = 60_000;

/**
 * Tableau de bord d'observabilité de l'Automation Engine (v0.8, voir brief
 * "OBSERVABILITÉ") : automatisations, jobs, historique, temps d'exécution
 * (moyen/minimal/maximal), erreurs, retries, files, workers, Dead Letter
 * Queue — mêmes conventions d'agrégation que `workflows/dashboard-service.ts`
 * (dont il est le pendant pour le noyau de jobs).
 */
export async function getAutomationDashboard(workspaceId: string) {
  const now = new Date();
  const [
    automationsByStatus,
    automations,
    runsByStatus,
    runDurationAgg,
    recentRuns,
    jobsByStatus,
    jobDurationAgg,
    jobTypeBreakdown,
    retryAgg,
    activeWorkersAgg,
    queueDepth,
    deadLetters,
  ] = await Promise.all([
    prisma.automation.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    prisma.automation.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
    prisma.automationRun.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    prisma.$queryRaw<{ avg_ms: number | null; min_ms: number | null; max_ms: number | null }[]>`
      SELECT
        AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000)::float8 AS avg_ms,
        MIN(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000)::float8 AS min_ms,
        MAX(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000)::float8 AS max_ms
      FROM "AutomationRun"
      WHERE "workspaceId" = ${workspaceId} AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL
    `,
    prisma.automationRun.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { automation: { select: { name: true, key: true } } },
    }),
    prisma.automationJob.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    prisma.$queryRaw<{ avg_ms: number | null; min_ms: number | null; max_ms: number | null }[]>`
      SELECT AVG("durationMs")::float8 AS avg_ms, MIN("durationMs")::float8 AS min_ms, MAX("durationMs")::float8 AS max_ms
      FROM "AutomationJob"
      WHERE "workspaceId" = ${workspaceId} AND "durationMs" IS NOT NULL
    `,
    prisma.$queryRaw<{ jobType: string; total: number; failed: number; avg_ms: number | null }[]>`
      SELECT "jobType",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('FAILED', 'DEAD_LETTERED', 'TIMED_OUT'))::int AS failed,
        AVG("durationMs")::float8 AS avg_ms
      FROM "AutomationJob"
      WHERE "workspaceId" = ${workspaceId}
      GROUP BY "jobType"
      ORDER BY avg_ms DESC NULLS LAST
      LIMIT 10
    `,
    prisma.$queryRaw<{ total_retries: number }[]>`
      SELECT COALESCE(SUM(GREATEST(attempt - 1, 0)), 0)::int AS total_retries
      FROM "AutomationJob"
      WHERE "workspaceId" = ${workspaceId}
    `,
    prisma.automationJob.findMany({
      where: { workspaceId, claimedBy: { not: null }, claimedAt: { gte: new Date(now.getTime() - ACTIVE_WORKER_WINDOW_MS) } },
      distinct: ["claimedBy"],
      select: { claimedBy: true },
    }),
    prisma.automationJob.count({ where: { workspaceId, status: "QUEUED", scheduledAt: { lte: now } } }),
    prisma.automationJob.findMany({ where: { workspaceId, status: "DEAD_LETTERED" }, orderBy: { finishedAt: "desc" }, take: 20 }),
  ]);

  const automationCounts = Object.fromEntries(automationsByStatus.map((row) => [row.status, row._count._all])) as Partial<Record<string, number>>;

  const runCounts = Object.fromEntries(runsByStatus.map((row) => [row.status, row._count._all])) as Partial<Record<string, number>>;
  const totalRuns = runsByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const succeededRuns = runCounts.SUCCEEDED ?? 0;
  const failedRuns = (runCounts.FAILED ?? 0) + (runCounts.TIMED_OUT ?? 0);

  const jobCounts = Object.fromEntries(jobsByStatus.map((row) => [row.status, row._count._all])) as Partial<Record<string, number>>;
  const totalJobs = jobsByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const succeededJobs = jobCounts.SUCCEEDED ?? 0;
  const deadLetteredJobs = jobCounts.DEAD_LETTERED ?? 0;
  const failedJobs = (jobCounts.FAILED ?? 0) + (jobCounts.TIMED_OUT ?? 0) + deadLetteredJobs;

  return {
    automations: {
      list: automations,
      counts: {
        draft: automationCounts.DRAFT ?? 0,
        active: automationCounts.ACTIVE ?? 0,
        inactive: automationCounts.INACTIVE ?? 0,
        archived: automationCounts.ARCHIVED ?? 0,
        total: automations.length,
      },
    },
    runs: {
      counts: {
        queued: runCounts.QUEUED ?? 0,
        running: runCounts.RUNNING ?? 0,
        waiting: runCounts.WAITING ?? 0,
        succeeded: succeededRuns,
        failed: failedRuns,
        cancelled: runCounts.CANCELLED ?? 0,
        total: totalRuns,
      },
      successRate: totalRuns > 0 ? succeededRuns / totalRuns : null,
      failureRate: totalRuns > 0 ? failedRuns / totalRuns : null,
      durationMs: {
        average: toPlainNumberOrNull(runDurationAgg[0]?.avg_ms),
        min: toPlainNumberOrNull(runDurationAgg[0]?.min_ms),
        max: toPlainNumberOrNull(runDurationAgg[0]?.max_ms),
      },
      recent: recentRuns,
    },
    jobs: {
      counts: {
        queued: jobCounts.QUEUED ?? 0,
        claimed: jobCounts.CLAIMED ?? 0,
        running: jobCounts.RUNNING ?? 0,
        waiting: jobCounts.WAITING ?? 0,
        succeeded: succeededJobs,
        failed: failedJobs,
        cancelled: jobCounts.CANCELLED ?? 0,
        deadLettered: deadLetteredJobs,
        total: totalJobs,
      },
      successRate: totalJobs > 0 ? succeededJobs / totalJobs : null,
      failureRate: totalJobs > 0 ? failedJobs / totalJobs : null,
      durationMs: {
        average: toPlainNumberOrNull(jobDurationAgg[0]?.avg_ms),
        min: toPlainNumberOrNull(jobDurationAgg[0]?.min_ms),
        max: toPlainNumberOrNull(jobDurationAgg[0]?.max_ms),
      },
      totalRetries: retryAgg[0]?.total_retries ?? 0,
      byJobType: jobTypeBreakdown.map((row) => ({
        jobType: row.jobType,
        total: row.total,
        failed: row.failed,
        failureRate: row.total > 0 ? row.failed / row.total : 0,
        averageDurationMs: toPlainNumberOrNull(row.avg_ms),
      })),
    },
    queue: {
      dueNow: queueDepth,
      workerPoolSize: getWorkerPoolSize(),
      activeWorkers: activeWorkersAgg.length,
    },
    deadLetterQueue: {
      count: deadLetteredJobs,
      recent: deadLetters,
    },
  };
}
