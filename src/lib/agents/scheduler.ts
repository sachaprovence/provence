import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ValidationError } from "@/lib/errors";
import { createAgentRun } from "./execution-engine";
import { AgentScheduleKind, AgentRunTrigger, AgentInstallationStatus } from "@/generated/prisma/enums";

/**
 * Planification des exécutions d'agent : ponctuelle, récurrente (cron), ou
 * déclenchée par un évènement applicatif (`eventKey`). `processDueAgentSchedules`
 * crée les `AgentRun` dus, sur le même principe que le moteur d'exécution
 * (ADR 0008) — appelé par `POST /api/cron/process-agent-schedules`.
 */
export async function createSchedule(params: {
  installationId: string;
  kind: AgentScheduleKind;
  cronExpression?: string;
  runAt?: Date;
  eventKey?: string;
  input?: unknown;
}) {
  if (params.kind === AgentScheduleKind.RECURRING && !params.cronExpression) {
    throw new ValidationError("Une planification récurrente nécessite une expression cron.");
  }
  if (params.kind === AgentScheduleKind.ONE_OFF && !params.runAt) {
    throw new ValidationError("Une planification ponctuelle nécessite une date d'exécution.");
  }
  if (params.kind === AgentScheduleKind.EVENT && !params.eventKey) {
    throw new ValidationError("Une planification événementielle nécessite une clé d'évènement.");
  }

  return prisma.agentSchedule.create({
    data: {
      installationId: params.installationId,
      kind: params.kind,
      cronExpression: params.cronExpression,
      runAt: params.runAt,
      eventKey: params.eventKey,
      input: (params.input ?? null) as never,
      nextRunAt: params.kind === AgentScheduleKind.ONE_OFF ? params.runAt : new Date(),
    },
  });
}

export async function deactivateSchedule(scheduleId: string) {
  return prisma.agentSchedule.update({ where: { id: scheduleId }, data: { isActive: false } });
}

/**
 * Déclenche les exécutions dues pour les planifications ONE_OFF et
 * RECURRING (les planifications EVENT sont déclenchées ailleurs, au
 * moment de l'évènement applicatif, pas par ce traitement périodique).
 *
 * Limite connue : le calcul de la prochaine échéance d'une planification
 * `RECURRING` est simplifié (report d'une heure fixe) plutôt qu'une
 * évaluation complète de l'expression cron — suffisant pour cette phase
 * d'infrastructure, sans agent métier réel dont la cadence exacte importe
 * encore. Documenté comme limite dans le rapport de livraison.
 */
export async function processDueAgentSchedules(now: Date = new Date()) {
  const due = await prisma.agentSchedule.findMany({
    where: {
      isActive: true,
      kind: { in: [AgentScheduleKind.ONE_OFF, AgentScheduleKind.RECURRING] },
      nextRunAt: { lte: now },
    },
    include: { installation: true },
  });

  const results: { scheduleId: string; ok: boolean; error?: string }[] = [];
  for (const schedule of due) {
    try {
      if (schedule.installation.status !== AgentInstallationStatus.ACTIVE) {
        logger.warn(
          { module: "agent-scheduler", scheduleId: schedule.id },
          "Planification ignorée : l'agent n'est pas actif."
        );
      } else {
        await createAgentRun({
          installationId: schedule.installationId,
          input: schedule.input,
          trigger: AgentRunTrigger.SCHEDULED,
        });
      }

      if (schedule.kind === AgentScheduleKind.ONE_OFF) {
        await prisma.agentSchedule.update({
          where: { id: schedule.id },
          data: { isActive: false, lastRunAt: now, nextRunAt: null },
        });
      } else {
        await prisma.agentSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: new Date(now.getTime() + 60 * 60 * 1000) },
        });
      }

      results.push({ scheduleId: schedule.id, ok: true });
    } catch (error) {
      results.push({ scheduleId: schedule.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/** Déclenche les planifications EVENT correspondant à une clé d'évènement applicatif donnée. */
export async function triggerEventSchedules(eventKey: string, input?: unknown) {
  const schedules = await prisma.agentSchedule.findMany({
    where: { isActive: true, kind: AgentScheduleKind.EVENT, eventKey },
    include: { installation: true },
  });

  const results: { scheduleId: string; ok: boolean }[] = [];
  for (const schedule of schedules) {
    if (schedule.installation.status !== AgentInstallationStatus.ACTIVE) continue;
    await createAgentRun({
      installationId: schedule.installationId,
      input: input ?? schedule.input,
      trigger: AgentRunTrigger.EVENT,
    });
    await prisma.agentSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: new Date() } });
    results.push({ scheduleId: schedule.id, ok: true });
  }
  return results;
}
