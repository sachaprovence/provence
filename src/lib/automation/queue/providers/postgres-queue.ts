import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { QueueProvider, QueuedJobRef } from "../types";

/**
 * Fournisseur par défaut : `AutomationJob` (Postgres) EST la file — même
 * principe que `AgentRun`/`WorkflowRun` (ADR 0008/0018), poussé jusqu'à une
 * réclamation atomique correcte sous concurrence réelle via
 * `FOR UPDATE SKIP LOCKED` (le motif standard des files basées sur
 * Postgres — `pg-boss`/`graphile-worker` procèdent de la même façon) :
 * deux workers qui réclament au même instant ne se volent jamais un job
 * l'un à l'autre.
 */
export class PostgresQueueProvider implements QueueProvider {
  readonly key = "postgres";

  async notify(): Promise<void> {
    // Sans effet : fournisseur par scrutation, voir Job Executor / cron de traitement.
  }

  async claim(params: { limit: number; workerId: string; jobTypes?: string[] }): Promise<QueuedJobRef[]> {
    // Deux instructions simples dans une transaction explicite plutôt qu'un
    // CTE modificateur unique : le verrou posé par `FOR UPDATE SKIP LOCKED`
    // sur la sélection est conservé jusqu'au commit de la transaction, donc
    // toujours sûr sous concurrence réelle, tout en restant une requête SQL
    // aussi simple à raisonner que possible (voir ADR 0032).
    return prisma.$transaction(async (tx) => {
      const candidates =
        params.jobTypes && params.jobTypes.length > 0
          ? await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
              SELECT id FROM "AutomationJob"
              WHERE status = 'QUEUED' AND "scheduledAt" <= now() AND "jobType" IN (${Prisma.join(params.jobTypes)})
              ORDER BY priority DESC, "scheduledAt" ASC
              LIMIT ${params.limit}
              FOR UPDATE SKIP LOCKED
            `)
          : await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
              SELECT id FROM "AutomationJob"
              WHERE status = 'QUEUED' AND "scheduledAt" <= now()
              ORDER BY priority DESC, "scheduledAt" ASC
              LIMIT ${params.limit}
              FOR UPDATE SKIP LOCKED
            `);

      if (candidates.length === 0) return [];

      await tx.automationJob.updateMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        data: { status: "CLAIMED", claimedAt: new Date(), claimedBy: params.workerId },
      });

      const claimed = await tx.automationJob.findMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        select: { id: true, jobType: true, priority: true },
        orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
      });
      return claimed;
    });
  }
}
