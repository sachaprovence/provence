import "server-only";
import { prisma } from "@/lib/prisma";
import { EmailEventType } from "@/generated/prisma/enums";
import { getWorkerPoolSize } from "@/lib/automation/concurrency";

/**
 * Métriques de base (brief v0.9 bis, AR-0049) : coût IA cumulé, taux de
 * succès/échec d'envoi email, latence API — consultables via une page
 * d'administration interne (`/settings/metrics`). Réutilise des données
 * DÉJÀ réellement journalisées plutôt que d'inventer un nouveau mécanisme
 * de collecte pour le coût IA et l'email :
 * - `AIRequest.estimatedCostUsd` (existant depuis v0.3, jamais exploité en
 *   agrégat jusqu'ici) ;
 * - `EmailEvent` (existant depuis v0.1, écrit à chaque envoi réel par
 *   `sequence-engine.ts`) ;
 * - `ApiRequestMetric` (nouveau, v0.9 bis) — seule table réellement
 *   nouvelle, car aucune mesure de latence n'existait auparavant.
 */
export interface MetricsRange {
  from: Date;
  to: Date;
}

const DEFAULT_RANGE_DAYS = 30;

export function defaultMetricsRange(now: Date = new Date()): MetricsRange {
  return { from: new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), to: now };
}

export async function getAiCostMetrics(organizationId: string, range: MetricsRange = defaultMetricsRange()) {
  const requests = await prisma.aIRequest.findMany({
    where: { organizationId, createdAt: { gte: range.from, lte: range.to } },
    select: { estimatedCostUsd: true, status: true },
  });
  const totalCostUsd = requests.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
  const byStatus: Record<string, number> = {};
  for (const r of requests) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { totalCostUsd, requestCount: requests.length, byStatus };
}

export async function getEmailMetrics(organizationId: string, range: MetricsRange = defaultMetricsRange()) {
  const events = await prisma.emailEvent.findMany({
    where: { createdAt: { gte: range.from, lte: range.to }, message: { lead: { organizationId } } },
    select: { type: true },
  });
  const sent = events.filter((e) => e.type === EmailEventType.SENT).length;
  const failed = events.filter((e) => e.type === EmailEventType.FAILED || e.type === EmailEventType.BOUNCED).length;
  const total = events.length;
  return { total, sent, failed, failureRate: total > 0 ? failed / total : 0 };
}

export async function getApiLatencyMetrics(organizationId: string, range: MetricsRange = defaultMetricsRange()) {
  const metrics = await prisma.apiRequestMetric.findMany({
    where: { organizationId, createdAt: { gte: range.from, lte: range.to } },
    select: { durationMs: true, route: true, statusCode: true },
  });
  const avgDurationMs = metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.durationMs, 0) / metrics.length : 0;
  const byRoute: Record<string, { count: number; avgDurationMs: number }> = {};
  for (const m of metrics) {
    const entry = byRoute[m.route] ?? { count: 0, avgDurationMs: 0 };
    entry.avgDurationMs = (entry.avgDurationMs * entry.count + m.durationMs) / (entry.count + 1);
    entry.count += 1;
    byRoute[m.route] = entry;
  }
  const errorCount = metrics.filter((m) => m.statusCode >= 500).length;
  // `errorRate` (v1.3, AR-0174) : dérivé de `errorCount`/`requestCount`, déjà mesurés ci-dessus — pas une nouvelle collecte.
  const errorRate = metrics.length > 0 ? errorCount / metrics.length : null;
  return { requestCount: metrics.length, avgDurationMs, errorCount, errorRate, byRoute };
}

/** Un worker est considéré "actif" s'il a réclamé un job dans la fenêtre récente — même heuristique que `automation/dashboard-service.ts` (aucun registre de workers vivants n'existe, voir ADR 0036). */
const ACTIVE_WORKER_WINDOW_MS = 60_000;

/**
 * Métriques de file d'attente/workers (v1.3, AR-0174) — réutilise
 * `AutomationJob` (existant depuis v0.8), agrégé par ORGANISATION (au lieu
 * de par workspace, voir `automation/dashboard-service.ts#getAutomationDashboard`)
 * pour rejoindre les autres métriques de cette page, elles aussi par organisation.
 */
export async function getQueueWorkerMetrics(organizationId: string) {
  const now = new Date();
  const [jobsByStatus, queueDepth, activeWorkersAgg] = await Promise.all([
    prisma.automationJob.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.automationJob.count({ where: { organizationId, status: "QUEUED", scheduledAt: { lte: now } } }),
    prisma.automationJob.findMany({
      where: { organizationId, claimedBy: { not: null }, claimedAt: { gte: new Date(now.getTime() - ACTIVE_WORKER_WINDOW_MS) } },
      distinct: ["claimedBy"],
      select: { claimedBy: true },
    }),
  ]);

  const jobCounts = Object.fromEntries(jobsByStatus.map((row) => [row.status, row._count._all])) as Partial<Record<string, number>>;
  const succeeded = jobCounts.SUCCEEDED ?? 0;
  const deadLettered = jobCounts.DEAD_LETTERED ?? 0;
  const failed = (jobCounts.FAILED ?? 0) + (jobCounts.TIMED_OUT ?? 0) + deadLettered;
  const total = jobsByStatus.reduce((sum, row) => sum + row._count._all, 0);

  return {
    queue: {
      dueNow: queueDepth,
      counts: {
        queued: jobCounts.QUEUED ?? 0,
        claimed: jobCounts.CLAIMED ?? 0,
        running: jobCounts.RUNNING ?? 0,
        waiting: jobCounts.WAITING ?? 0,
        succeeded,
        failed,
        deadLettered,
        total,
      },
      failureRate: total > 0 ? failed / total : null,
    },
    workers: {
      poolSize: getWorkerPoolSize(),
      active: activeWorkersAgg.length,
    },
  };
}

export async function getObservabilityMetrics(organizationId: string, range: MetricsRange = defaultMetricsRange()) {
  const [ai, email, apiLatency, queueWorker] = await Promise.all([
    getAiCostMetrics(organizationId, range),
    getEmailMetrics(organizationId, range),
    getApiLatencyMetrics(organizationId, range),
    getQueueWorkerMetrics(organizationId),
  ]);
  return { ai, email, apiLatency, queue: queueWorker.queue, workers: queueWorker.workers, range };
}
