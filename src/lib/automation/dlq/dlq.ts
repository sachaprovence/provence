import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Dead Letter Queue (Automation Engine, v0.8) : jamais une table séparée —
 * une simple vue/service sur `AutomationJob.status = 'DEAD_LETTERED'` (le
 * statut posé par le Job Executor quand le Retry Engine décide de ne plus
 * retenter — épuisement des tentatives, stratégie "manual", ou condition
 * non remplie). `replayDeadLetter` est la seule façon de faire ressortir
 * un job de la DLQ : remise en file explicite, jamais automatique.
 */
export async function sendToDeadLetter(jobId: string, reason: string): Promise<void> {
  await prisma.automationJob.update({
    where: { id: jobId },
    data: { status: "DEAD_LETTERED", finishedAt: new Date(), error: { message: reason } },
  });
}

export async function listDeadLetters(params: { organizationId: string; workspaceId?: string; limit?: number }) {
  return prisma.automationJob.findMany({
    where: { organizationId: params.organizationId, workspaceId: params.workspaceId, status: "DEAD_LETTERED" },
    orderBy: { finishedAt: "desc" },
    take: params.limit ?? 50,
  });
}

/** Remet un job de la DLQ en file (`QUEUED`, tentative réinitialisée) — strictement scopé organisation/workspace, jamais par id seul (voir ADR 0035). */
export async function replayDeadLetter(jobId: string, scope: { organizationId: string; workspaceId: string }) {
  const job = await prisma.automationJob.findFirst({
    where: { id: jobId, organizationId: scope.organizationId, workspaceId: scope.workspaceId },
  });
  if (!job) throw new NotFoundError("Job introuvable.");
  if (job.status !== "DEAD_LETTERED") {
    throw new ValidationError("Seul un job dans la Dead Letter Queue peut être rejoué.");
  }

  return prisma.automationJob.update({
    where: { id: jobId },
    data: {
      status: "QUEUED",
      attempt: 0,
      scheduledAt: new Date(),
      error: Prisma.JsonNull,
      claimedAt: null,
      claimedBy: null,
      startedAt: null,
      finishedAt: null,
    },
  });
}
