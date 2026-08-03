import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { NotFoundError } from "@/lib/errors";
import { subscribeAutomationEvent } from "./triggers/event-dispatcher";
import { matchesSchedule, type ScheduleDefinition } from "./scheduler/schedule-engine";
import { createAutomationRun } from "./registry/automation-service";
import { advanceAutomationRun } from "./executor/job-executor";

/**
 * Trigger Engine (Automation Engine, v0.8) : le point qui relie un
 * déclencheur DÉCLARÉ (`AutomationTriggerBinding`, indexé par
 * `automation-service.ts#activateAutomationVersion`) à un déclenchement
 * RÉEL — évènement applicatif (`fireAutomationsForEvent`), planification
 * cron évaluée à chaque appel (`processDueAutomationSchedules` —
 * supposé appelé au plus une fois par minute par l'infrastructure de cron,
 * même hypothèse implicite que `workflows/trigger-engine.ts`), ou webhook
 * (`fireAutomationWebhook`). Même séparation que le Workflow Engine (v0.6) :
 * ce module ne connaît RIEN du contenu métier des évènements, seulement la
 * clé qui les identifie.
 *
 * Filtre STRICTEMENT par organisation quand le payload en fournit une
 * (`payload.organizationId`) — contrairement à
 * `workflows/trigger-engine.ts#triggerWorkflowsForEvent`, qui ne le fait
 * pas (aucune régression introduite : ce module est nouveau, pas une
 * modification du Workflow Engine) : un évènement de l'organisation A ne
 * doit jamais pouvoir déclencher une automatisation de l'organisation B.
 */

type TriggerBindingRef = { automationId: string; automationVersionId: string; workspaceId: string; config: unknown };

async function fireBinding(binding: TriggerBindingRef, triggerKey: string, payload: unknown, trigger: "EVENT" | "WEBHOOK" | "SCHEDULED") {
  const automation = await prisma.automation.findUnique({ where: { id: binding.automationId } });
  if (!automation || automation.status !== "ACTIVE" || !automation.organizationId) return;

  const run = await createAutomationRun({
    organizationId: automation.organizationId,
    workspaceId: binding.workspaceId,
    automationId: binding.automationId,
    automationVersionId: binding.automationVersionId,
    input: payload,
    trigger,
    triggerKey,
  });
  await advanceAutomationRun(run.id).catch((error) => {
    logger.error({ module: "automation-trigger-engine", runId: run.id, triggerKey, err: error }, "Échec du déclenchement d'une automatisation.");
  });
}

/** Déclenche toutes les automatisations actives abonnées à `eventKey` — scopé par organisation quand le payload en fournit une. */
export async function fireAutomationsForEvent(eventKey: string, payload: Record<string, unknown> = {}): Promise<{ triggered: number }> {
  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId : undefined;
  const bindings = await prisma.automationTriggerBinding.findMany({
    where: {
      triggerKey: eventKey,
      isActive: true,
      automation: { status: "ACTIVE", ...(organizationId ? { organizationId } : {}) },
    },
  });
  for (const binding of bindings) await fireBinding(binding, eventKey, payload, "EVENT");
  return { triggered: bindings.length };
}

/** Déclenchement webhook : cible UNE SEULE automatisation (par workspace + clé), jamais une diffusion. */
export async function fireAutomationWebhook(workspaceId: string, automationKey: string, payload: unknown) {
  const automation = await prisma.automation.findFirst({ where: { workspaceId, key: automationKey, status: "ACTIVE" } });
  if (!automation?.activeVersionId || !automation.organizationId) {
    throw new NotFoundError(`Aucune automatisation active trouvée pour la clé "${automationKey}".`);
  }
  const run = await createAutomationRun({
    organizationId: automation.organizationId,
    workspaceId,
    automationId: automation.id,
    automationVersionId: automation.activeVersionId,
    input: payload,
    trigger: "WEBHOOK",
    triggerKey: "webhook.received",
  });
  await advanceAutomationRun(run.id);
  return prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
}

type RawScheduleConfig = {
  cronExpression?: string;
  timezone?: string;
  businessDaysOnly?: boolean;
  holidays?: string[];
  blackoutPeriods?: { start: string; end: string }[];
  executionWindows?: { startTime: string; endTime: string }[];
};

/**
 * Évalue les déclencheurs "Cron" (`schedule.cron`) actifs — seul déclencheur
 * de planification réellement câblé pour l'instant (même honnêteté que
 * `workflows/trigger-engine.ts#processDueWorkflowCronTriggers`, qui ne câble
 * que "schedule.cron" et pas "schedule.time" malgré sa présence au
 * catalogue) : "schedule.date"/"schedule.interval" sont déclarés mais pas
 * encore déclenchés automatiquement — voir ROADMAP.md.
 */
export async function processDueAutomationSchedules(now: Date = new Date()): Promise<{ triggered: number }> {
  const bindings = await prisma.automationTriggerBinding.findMany({
    where: { triggerKey: "schedule.cron", isActive: true, automation: { status: "ACTIVE" } },
  });

  let triggered = 0;
  for (const binding of bindings) {
    const raw = binding.config as RawScheduleConfig | null;
    if (!raw?.cronExpression) continue;
    const schedule: ScheduleDefinition = {
      cronExpression: raw.cronExpression,
      timezone: raw.timezone,
      businessDaysOnly: raw.businessDaysOnly,
      holidays: raw.holidays,
      blackoutPeriods: raw.blackoutPeriods?.map((p) => ({ start: new Date(p.start), end: new Date(p.end) })),
      executionWindows: raw.executionWindows,
    };
    try {
      if (matchesSchedule(schedule, now)) {
        await fireBinding(binding, "schedule.cron", { firedAt: now.toISOString() }, "SCHEDULED");
        triggered += 1;
      }
    } catch (error) {
      logger.warn({ module: "automation-trigger-engine", bindingId: binding.id, err: error }, "Planification invalide — déclencheur ignoré.");
    }
  }
  return { triggered };
}

/**
 * Clés d'évènement RÉELLEMENT publiées par une route/un service Provence 360
 * (voir ADR 0037) — abonnement explicite une fois au bootstrap, jamais un
 * abonnement générique "à tout". Étendue en v0.9 (task #91, automatisations
 * métier prêtes à l'emploi) avec les évènements commerciaux/finance/
 * production déjà publiés par les services v0.9 (`quote-service.ts`,
 * `invoice-service.ts`, `virtual-tour-service.ts`, `appointments`) mais
 * jusque-là sans abonné — exactement le cas anticipé par l'ADR 0037
 * ("étendre le câblage réel se limite à ajouter une clé ici").
 */
const REAL_EMISSION_EVENT_KEYS = [
  "organization.created",
  "workspace.created",
  "user.registered",
  "user.logged_in",
  "lead.created",
  "lead.updated",
  "lead.deleted",
  "import.completed",
  "appointment.created",
  "quote.sent",
  "quote.signed",
  "quote.signature_declined",
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "virtual_tour.created",
  "virtual_tour.shooting_done",
  "virtual_tour.published",
  "property.created",
] as const;

let subscribed = false;

/** Abonnement idempotent aux évènements réellement émis — voir `bootstrap.ts`. */
export function subscribeAutomationTriggerEvents(): void {
  if (subscribed) return;
  subscribed = true;
  for (const eventKey of REAL_EMISSION_EVENT_KEYS) {
    subscribeAutomationEvent(eventKey, async (payload) => {
      await fireAutomationsForEvent(eventKey, payload);
    });
  }
}
