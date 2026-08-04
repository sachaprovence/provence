import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  isWithinAllowedWindow,
  enrollLeadInSequence,
  stopEnrollmentsForLead,
  sendMessageNow,
  processDueSequences,
  DuplicateEnrollmentError,
  SuppressedLeadError,
} from "@/lib/sequence-engine";
import { addSuppression } from "@/lib/suppression";
import {
  EnrollmentStatus,
  EnrollmentStopReason,
  LeadStage,
  MessageStatus,
  MessageType,
  EmailEventType,
  SequenceChannel,
  SuppressionReason,
} from "@/generated/prisma/enums";

/**
 * Moteur de séquences (v0.10, AR-0158) — moteur de relance email central,
 * consommé par 9 routes, jusqu'ici sans **aucun** test. Couvre les
 * parcours critiques réels : inscription (avec rejets explicites),
 * arrêt, envoi (email réussi/échoué/canal non-email), progression et
 * complétion d'une séquence de bout en bout, et la fenêtre horaire
 * autorisée.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const ALWAYS_OPEN_WINDOW = { allowedStartHour: 0, allowedEndHour: 24, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] };
const NEVER_OPEN_WINDOW = { allowedStartHour: 0, allowedEndHour: 24, allowedWeekdays: [] as number[] };

describe("isWithinAllowedWindow", () => {
  it("autorise toujours quand la fenêtre couvre toute la semaine et toute la journée", () => {
    expect(isWithinAllowedWindow(ALWAYS_OPEN_WINDOW, new Date())).toBe(true);
  });

  it("refuse toujours quand aucun jour n'est autorisé", () => {
    expect(isWithinAllowedWindow(NEVER_OPEN_WINDOW, new Date())).toBe(false);
  });

  it("refuse en dehors de la plage horaire autorisée", () => {
    const step = { allowedStartHour: 9, allowedEndHour: 10, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] };
    const outsideWindow = new Date();
    outsideWindow.setHours(23, 0, 0, 0);
    expect(isWithinAllowedWindow(step, outsideWindow)).toBe(false);
  });
});

runIfDatabase("enrollLeadInSequence / stopEnrollmentsForLead", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function setup(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org séquence ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        establishmentName: `Prospect ${suffix}`,
        contacts: { create: { email: `${suffix}@example.test`, isPrimary: true } },
      },
    });
    const sequence = await prisma.sequence.create({ data: { organizationId: organization.id, name: `Séquence ${suffix}` } });
    const step = await prisma.sequenceStep.create({
      data: {
        sequenceId: sequence.id,
        order: 1,
        delayDays: 3,
        channel: SequenceChannel.EMAIL,
        templateKey: MessageType.FOLLOW_UP_SHORT,
        ...ALWAYS_OPEN_WINDOW,
      },
    });
    return { organization, lead, sequence, step };
  }

  it("crée une inscription active, planifie nextRunAt selon le délai de la première étape, et fait avancer le prospect en FOLLOW_UP_SCHEDULED", async () => {
    const { lead, sequence } = await setup("enroll");
    const before = Date.now();

    const enrollment = await enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id });

    expect(enrollment.status).toBe(EnrollmentStatus.ACTIVE);
    expect(enrollment.currentStepOrder).toBe(0);
    expect(enrollment.nextRunAt).not.toBeNull();
    expect(enrollment.nextRunAt!.getTime()).toBeGreaterThan(before + 2 * 24 * 60 * 60 * 1000);

    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.stage).toBe(LeadStage.FOLLOW_UP_SCHEDULED);
  });

  it("refuse explicitement une double inscription active à la même séquence", async () => {
    const { lead, sequence } = await setup("duplicate");
    await enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id });

    await expect(enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id })).rejects.toBeInstanceOf(DuplicateEnrollmentError);
  });

  it("refuse explicitement d'inscrire un prospect sur liste d'exclusion", async () => {
    const { organization, lead, sequence } = await setup("suppressed");
    await addSuppression({ organizationId: organization.id, email: `suppressed@example.test`, reason: SuppressionReason.UNSUBSCRIBED });
    await prisma.leadContact.updateMany({ where: { leadId: lead.id }, data: { email: "suppressed@example.test" } });

    await expect(enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id })).rejects.toBeInstanceOf(SuppressedLeadError);
  });

  it("stopEnrollmentsForLead arrête toutes les inscriptions actives/en pause avec le motif fourni", async () => {
    const { lead, sequence } = await setup("stop");
    const enrollment = await enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id });

    await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.REPLIED);

    const updated = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.status).toBe(EnrollmentStatus.STOPPED);
    expect(updated.stopReason).toBe(EnrollmentStopReason.REPLIED);
    expect(updated.stoppedAt).not.toBeNull();
  });
});

runIfDatabase("sendMessageNow", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrgAndLead(suffix: string, contactEmail: string | null) {
    const organization = await prisma.organization.create({ data: { name: `Org envoi ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        establishmentName: `Prospect ${suffix}`,
        contacts: contactEmail ? { create: { email: contactEmail, isPrimary: true } } : undefined,
      },
    });
    return { organization, lead };
  }

  async function createMessage(params: { leadId: string; channel: SequenceChannel; status?: MessageStatus }) {
    return prisma.message.create({
      data: {
        leadId: params.leadId,
        type: MessageType.FOLLOW_UP_SHORT,
        channel: params.channel,
        body: "Corps du message de test.",
        subject: "Sujet de test",
        status: params.status ?? MessageStatus.APPROVED,
      },
    });
  }

  it("échoue explicitement (sans envoi) pour un prospect suppressé, et arrête ses inscriptions", async () => {
    const { organization, lead } = await createOrgAndLead("suppressed", "suppressed-send@example.test");
    await addSuppression({ organizationId: organization.id, email: "suppressed-send@example.test", reason: SuppressionReason.BOUNCED });
    const message = await createMessage({ leadId: lead.id, channel: SequenceChannel.EMAIL });

    await sendMessageNow(message.id);

    const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe(MessageStatus.FAILED);
    const events = await prisma.emailEvent.findMany({ where: { messageId: message.id } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(EmailEventType.FAILED);
    expect((events[0].metadata as { reason?: string } | null)?.reason).toBe("suppressed");
  });

  it("échoue explicitement quand le prospect n'a aucune adresse email de contact", async () => {
    const { lead } = await createOrgAndLead("no-email", null);
    const message = await createMessage({ leadId: lead.id, channel: SequenceChannel.EMAIL });

    await sendMessageNow(message.id);

    const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe(MessageStatus.FAILED);
    const events = await prisma.emailEvent.findMany({ where: { messageId: message.id } });
    expect((events[0].metadata as { reason?: string } | null)?.reason).toBe("no_contact_email");
  });

  it("échoue explicitement (jamais un envoi silencieux) une fois le quota email quotidien de l'organisation atteint", async () => {
    const { organization, lead } = await createOrgAndLead("quota", "quota@example.test");
    await prisma.organization.update({ where: { id: organization.id }, data: { dailySendLimit: 1 } });
    const otherLead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Autre prospect" } });
    await prisma.message.create({
      data: { leadId: otherLead.id, type: MessageType.FOLLOW_UP_SHORT, channel: SequenceChannel.EMAIL, body: "b", status: MessageStatus.SENT, sentAt: new Date() },
    });
    const message = await createMessage({ leadId: lead.id, channel: SequenceChannel.EMAIL });

    await sendMessageNow(message.id);

    const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe(MessageStatus.FAILED);
    const events = await prisma.emailEvent.findMany({ where: { messageId: message.id } });
    expect((events[0].metadata as { reason?: string } | null)?.reason).toBe("daily_limit_reached");
  });

  it("envoie réellement un email et marque le prospect CONTACTED", async () => {
    const { lead } = await createOrgAndLead("success", "success@example.test");
    const message = await createMessage({ leadId: lead.id, channel: SequenceChannel.EMAIL });

    await sendMessageNow(message.id);

    const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe(MessageStatus.SENT);
    expect(updated.sentAt).not.toBeNull();
    expect(updated.providerMessageId).not.toBeNull();

    const events = await prisma.emailEvent.findMany({ where: { messageId: message.id } });
    expect(events[0].type).toBe(EmailEventType.SENT);

    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.stage).toBe(LeadStage.CONTACTED);
  });

  it("un canal non-email (LinkedIn/SMS/appel) est marqué envoyé sans passer par un fournisseur d'email", async () => {
    const { lead } = await createOrgAndLead("linkedin", "linkedin@example.test");
    const message = await createMessage({ leadId: lead.id, channel: SequenceChannel.LINKEDIN });

    await sendMessageNow(message.id);

    const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe(MessageStatus.SENT);
    expect(updated.providerMessageId).toBeNull();
    expect(await prisma.emailEvent.count({ where: { messageId: message.id } })).toBe(0);
  });
});

runIfDatabase("processDueSequences — progression et complétion de bout en bout", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function setupSequence(suffix: string, stepDefs: { delayDays: number }[]) {
    const organization = await prisma.organization.create({ data: { name: `Org progression ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        establishmentName: `Prospect ${suffix}`,
        contacts: { create: { email: `${suffix}@example.test`, isPrimary: true } },
      },
    });
    const sequence = await prisma.sequence.create({ data: { organizationId: organization.id, name: `Séquence ${suffix}` } });
    for (const [index, def] of stepDefs.entries()) {
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          order: index + 1,
          delayDays: def.delayDays,
          channel: SequenceChannel.EMAIL,
          templateKey: MessageType.FOLLOW_UP_SHORT,
          requiresValidation: false,
          ...ALWAYS_OPEN_WINDOW,
        },
      });
    }
    return { organization, lead, sequence };
  }

  it("une séquence à une seule étape se termine (COMPLETED) après l'envoi automatique", async () => {
    const { lead, sequence } = await setupSequence("single-step", [{ delayDays: 0 }]);
    const enrollment = await enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id });

    const results = await processDueSequences(new Date(Date.now() + 5000));
    expect(results).toContainEqual({ enrollmentId: enrollment.id, ok: true });

    const updated = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.status).toBe(EnrollmentStatus.COMPLETED);
    expect(updated.nextRunAt).toBeNull();

    const messages = await prisma.message.findMany({ where: { leadId: lead.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe(MessageStatus.SENT);
  });

  it("une séquence à deux étapes progresse (reste ACTIVE, planifie la deuxième étape) après l'envoi de la première", async () => {
    const { lead, sequence } = await setupSequence("two-steps", [{ delayDays: 0 }, { delayDays: 5 }]);
    const enrollment = await enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id });

    await processDueSequences(new Date(Date.now() + 5000));

    const updated = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.status).toBe(EnrollmentStatus.ACTIVE);
    expect(updated.currentStepOrder).toBe(1);
    expect(updated.nextRunAt).not.toBeNull();
    expect(updated.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 4 * 24 * 60 * 60 * 1000);
  });

  it("une étape hors fenêtre horaire autorisée est reportée d'une heure, sans envoyer de message", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org fenêtre horaire" } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: "Prospect fenêtre", contacts: { create: { email: "fenetre@example.test" } } },
    });
    const sequence = await prisma.sequence.create({ data: { organizationId: organization.id, name: "Séquence fenêtre" } });
    await prisma.sequenceStep.create({
      data: {
        sequenceId: sequence.id,
        order: 1,
        delayDays: 0,
        channel: SequenceChannel.EMAIL,
        templateKey: MessageType.FOLLOW_UP_SHORT,
        requiresValidation: false,
        ...NEVER_OPEN_WINDOW,
      },
    });
    const enrollment = await enrollLeadInSequence({ leadId: lead.id, sequenceId: sequence.id });
    const originalNextRunAt = enrollment.nextRunAt!.getTime();

    await processDueSequences(new Date(Date.now() + 5000));

    const updated = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.status).toBe(EnrollmentStatus.ACTIVE);
    expect(updated.currentStepOrder).toBe(0);
    expect(updated.nextRunAt!.getTime()).toBeGreaterThan(originalNextRunAt);
    expect(await prisma.message.count({ where: { leadId: lead.id } })).toBe(0);
  });
});
