import { prisma } from "@/lib/prisma";
import { LeadStage, MissionStatus, TaskStatus } from "@/generated/prisma/enums";

/**
 * Moteur d'automatisation interne : chaque règle métier est une fonction dédiée
 * (plus simple et plus fiable qu'un interpréteur de règles générique pour un
 * MVP), mais reste activable/désactivable depuis les paramètres via la table
 * `AutomationRule` (clé `triggerType`).
 */

export const AUTOMATION_TRIGGER_KEYS = {
  HIGH_SCORE_VALIDATION: "high_score_validation",
  POSITIVE_REPLY_NOTIFY: "positive_reply_notify",
  APPOINTMENT_MOVES_PIPELINE: "appointment_moves_pipeline",
  STALE_QUOTE_FOLLOW_UP: "stale_quote_follow_up",
  WON_CREATES_MISSION: "won_creates_mission",
  MISSION_SUGGESTS_PROVIDER: "mission_suggests_provider",
  UNSUBSCRIBE_BLOCKS_FUTURE: "unsubscribe_blocks_future",
} as const;

export const DEFAULT_AUTOMATION_RULES: { triggerType: string; name: string; actionType: string }[] = [
  { triggerType: AUTOMATION_TRIGGER_KEYS.HIGH_SCORE_VALIDATION, name: "Score > 80 → tâche de validation", actionType: "create_task" },
  { triggerType: AUTOMATION_TRIGGER_KEYS.POSITIVE_REPLY_NOTIFY, name: "Réponse positive → notifier le commercial", actionType: "notify" },
  { triggerType: AUTOMATION_TRIGGER_KEYS.APPOINTMENT_MOVES_PIPELINE, name: "RDV pris → déplacer dans le pipeline", actionType: "move_stage" },
  { triggerType: AUTOMATION_TRIGGER_KEYS.STALE_QUOTE_FOLLOW_UP, name: "Devis sans réponse 7 jours → relance", actionType: "create_task" },
  { triggerType: AUTOMATION_TRIGGER_KEYS.WON_CREATES_MISSION, name: "Client gagné → créer une mission", actionType: "create_mission" },
  { triggerType: AUTOMATION_TRIGGER_KEYS.MISSION_SUGGESTS_PROVIDER, name: "Mission créée → proposer le prestataire le plus proche", actionType: "assign_provider" },
  { triggerType: AUTOMATION_TRIGGER_KEYS.UNSUBSCRIBE_BLOCKS_FUTURE, name: "Désinscription → bloquer les envois futurs", actionType: "suppress" },
];

async function isRuleActive(organizationId: string, triggerType: string): Promise<boolean> {
  const rule = await prisma.automationRule.findFirst({ where: { organizationId, triggerType } });
  return rule ? rule.isActive : true; // actif par défaut si non configuré explicitement
}

export async function onLeadScoreComputed(leadId: string, organizationId: string, scoreValue: number) {
  if (scoreValue < 80) return;
  if (!(await isRuleActive(organizationId, AUTOMATION_TRIGGER_KEYS.HIGH_SCORE_VALIDATION))) return;

  const existing = await prisma.task.findFirst({
    where: { leadId, status: TaskStatus.OPEN, title: { startsWith: "Valider ce prospect prioritaire" } },
  });
  if (existing) return;

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { establishmentName: true, assignedToId: true } });
  await prisma.task.create({
    data: {
      organizationId,
      leadId,
      assigneeId: lead?.assignedToId ?? undefined,
      title: `Valider ce prospect prioritaire (score ≥ 80) — ${lead?.establishmentName ?? ""}`,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

export async function onPositiveReply(leadId: string, organizationId: string) {
  if (!(await isRuleActive(organizationId, AUTOMATION_TRIGGER_KEYS.POSITIVE_REPLY_NOTIFY))) return;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { establishmentName: true, assignedToId: true } });
  await prisma.notification.create({
    data: {
      organizationId,
      userId: lead?.assignedToId ?? undefined,
      type: "positive_reply",
      title: "Réponse positive reçue",
      body: `${lead?.establishmentName ?? "Un prospect"} a répondu positivement.`,
      link: `/leads/${leadId}`,
    },
  });
}

export async function onAppointmentBooked(leadId: string, organizationId: string) {
  if (!(await isRuleActive(organizationId, AUTOMATION_TRIGGER_KEYS.APPOINTMENT_MOVES_PIPELINE))) return;
  await prisma.lead.update({ where: { id: leadId }, data: { stage: LeadStage.APPOINTMENT_SCHEDULED } });
}

export async function checkStaleQuotes(organizationId: string) {
  if (!(await isRuleActive(organizationId, AUTOMATION_TRIGGER_KEYS.STALE_QUOTE_FOLLOW_UP))) return 0;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleQuotes = await prisma.quote.findMany({
    where: { organizationId, status: "SENT", sentAt: { lte: sevenDaysAgo } },
    include: { lead: true },
  });
  let created = 0;
  for (const quote of staleQuotes) {
    const existing = await prisma.task.findFirst({
      where: { leadId: quote.leadId, status: TaskStatus.OPEN, title: { startsWith: `Relancer le devis ${quote.reference}` } },
    });
    if (existing) continue;
    await prisma.task.create({
      data: {
        organizationId,
        leadId: quote.leadId,
        title: `Relancer le devis ${quote.reference} (${quote.lead.establishmentName}) — envoyé il y a plus de 7 jours`,
        dueAt: new Date(),
      },
    });
    created += 1;
  }
  return created;
}

export async function onDealWon(leadId: string, organizationId: string) {
  const customer = await prisma.customer.upsert({
    where: { leadId },
    update: {},
    create: { organizationId, leadId },
  });

  if (!(await isRuleActive(organizationId, AUTOMATION_TRIGGER_KEYS.WON_CREATES_MISSION))) return customer;

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const mission = await prisma.mission.create({
    data: {
      organizationId,
      customerId: customer.id,
      territoryId: lead.territoryId,
      title: `Mission — ${lead.establishmentName}`,
      status: MissionStatus.PROPOSED,
    },
  });

  if (await isRuleActive(organizationId, AUTOMATION_TRIGGER_KEYS.MISSION_SUGGESTS_PROVIDER)) {
    await suggestProviderForMission(mission.id);
  }

  return customer;
}

export async function suggestProviderForMission(missionId: string) {
  const mission = await prisma.mission.findUniqueOrThrow({ where: { id: missionId } });
  if (mission.providerId || !mission.territoryId) return null;

  const provider = await prisma.provider.findFirst({
    where: { organizationId: mission.organizationId, territoryId: mission.territoryId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!provider) return null;

  await prisma.mission.update({ where: { id: mission.id }, data: { providerId: provider.id } });
  return provider;
}
