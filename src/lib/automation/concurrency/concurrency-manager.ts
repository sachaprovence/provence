import "server-only";
import { prisma } from "@/lib/prisma";
import { sharedRateLimiter } from "./rate-limiter";

/**
 * Concurrency Manager (Automation Engine, v0.8) : applique, APRÈS que le
 * Queue Manager a réclamé un lot de jobs, les limites de concurrence — un
 * job réclamé mais qui ne passe pas ces limites est immédiatement rendu à
 * la file (`status` remis à `QUEUED`) plutôt qu'exécuté, il sera retenté
 * au prochain tick. Trois niveaux, tous optionnels (non restrictif par
 * défaut) :
 *
 * - **Taille du pool de workers** (`AUTOMATION_WORKER_POOL_SIZE`) : borne
 *   le nombre de jobs réclamés par tick (paramètre `limit` du Queue
 *   Manager, pas de ce module — voir Job Executor).
 * - **Maximum global de jobs en cours** (`AUTOMATION_MAX_CONCURRENT_JOBS`) :
 *   protège la base/l'infrastructure, tous jobs confondus.
 * - **Maximum par `concurrencyKey`** (`AutomationJob.concurrencyLimit`,
 *   déclaré par job) : ex. "un seul job à la fois par prospect" en donnant
 *   `concurrencyKey = "prospect:<id>"` et `concurrencyLimit = 1`.
 *
 * Le limiteur de débit (`rateLimitKey`) est un troisième filtre indépendant
 * (voir `rate-limiter.ts`), pour protéger un fournisseur externe plutôt
 * qu'une ressource interne.
 */

export function getWorkerPoolSize(): number {
  const raw = process.env.AUTOMATION_WORKER_POOL_SIZE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function getGlobalMaxConcurrentJobs(): number | null {
  const raw = process.env.AUTOMATION_MAX_CONCURRENT_JOBS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Capacité restante avant d'atteindre le maximum global de jobs `RUNNING` — `null` si aucune limite configurée. */
export async function remainingGlobalCapacity(): Promise<number | null> {
  const max = getGlobalMaxConcurrentJobs();
  if (max === null) return null;
  const running = await prisma.automationJob.count({ where: { status: "RUNNING" } });
  return Math.max(0, max - running);
}

export type ConcurrencyCandidate = {
  id: string;
  concurrencyKey: string | null;
  concurrencyLimit: number | null;
  rateLimitKey: string | null;
};

/**
 * Filtre un lot de jobs déjà réclamés (`CLAIMED`) : renvoie ceux admis à
 * s'exécuter maintenant et ceux à différer (remis en `QUEUED` par
 * l'appelant — voir Job Executor). Tient compte, au sein du MÊME lot, des
 * admissions déjà décidées pour ne jamais dépasser `concurrencyLimit`
 * même si plusieurs jobs du lot partagent la même clé.
 */
export async function admitByConcurrency(jobs: ConcurrencyCandidate[]): Promise<{ admitted: string[]; deferred: string[] }> {
  const admitted: string[] = [];
  const deferred: string[] = [];

  const uniqueKeys = Array.from(new Set(jobs.map((j) => j.concurrencyKey).filter((k): k is string => Boolean(k))));
  const runningCounts = new Map<string, number>(
    await Promise.all(
      uniqueKeys.map(async (key): Promise<[string, number]> => [key, await prisma.automationJob.count({ where: { concurrencyKey: key, status: "RUNNING" } })])
    )
  );
  const admittedThisBatch = new Map<string, number>();

  for (const job of jobs) {
    if (job.concurrencyKey && job.concurrencyLimit !== null && job.concurrencyLimit !== undefined) {
      const alreadyRunning = runningCounts.get(job.concurrencyKey) ?? 0;
      const alreadyAdmitted = admittedThisBatch.get(job.concurrencyKey) ?? 0;
      if (alreadyRunning + alreadyAdmitted >= job.concurrencyLimit) {
        deferred.push(job.id);
        continue;
      }
      admittedThisBatch.set(job.concurrencyKey, alreadyAdmitted + 1);
    }

    if (job.rateLimitKey && !sharedRateLimiter.tryConsume(job.rateLimitKey)) {
      deferred.push(job.id);
      continue;
    }

    admitted.push(job.id);
  }

  return { admitted, deferred };
}
