import { prisma } from "@/lib/prisma";
import { getAIProviderForOrganization } from "@/lib/ai";
import { getEmailProvider } from "@/lib/email";
import { unsubscribeUrl } from "@/lib/unsubscribe-token";
import { isSuppressed } from "@/lib/suppression";
import { writeAuditLog } from "@/lib/audit";
import {
  EnrollmentStatus,
  EnrollmentStopReason,
  LeadStage,
  MessageStatus,
  MessageType,
  EmailEventType,
  SequenceChannel,
} from "@/generated/prisma/enums";
import type { LeadFactsInput } from "@/lib/ai/types";

export class DuplicateEnrollmentError extends Error {}
export class SuppressedLeadError extends Error {}

function leadToFacts(lead: {
  establishmentName: string;
  category: string;
  city: string | null;
  region: string | null;
  websiteUrl: string | null;
  hasVirtualTour: boolean | null;
  reviewCount: number | null;
  averageRating: number | null;
  socialLinks: unknown;
  closedBusiness: boolean;
  contacts: { fullName: string | null }[];
}): LeadFactsInput {
  return {
    establishmentName: lead.establishmentName,
    category: lead.category,
    city: lead.city,
    region: lead.region,
    websiteUrl: lead.websiteUrl,
    hasVirtualTour: lead.hasVirtualTour,
    reviewCount: lead.reviewCount,
    averageRating: lead.averageRating,
    socialLinks: (lead.socialLinks as Record<string, string> | null) ?? null,
    closedBusiness: lead.closedBusiness,
    contactName: lead.contacts.find((c) => c.fullName)?.fullName ?? null,
  };
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Vérifie que l'heure/jour courant correspond à la fenêtre autorisée d'une étape. */
export function isWithinAllowedWindow(
  step: { allowedStartHour: number; allowedEndHour: number; allowedWeekdays: number[] },
  now: Date
) {
  const day = now.getDay();
  const hour = now.getHours();
  return step.allowedWeekdays.includes(day) && hour >= step.allowedStartHour && hour < step.allowedEndHour;
}

export async function enrollLeadInSequence(params: {
  leadId: string;
  sequenceId: string;
  campaignId?: string | null;
}) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: params.leadId }, include: { contacts: true } });

  const primaryEmail = lead.contacts.find((c) => c.email)?.email ?? null;
  if (lead.isSuppressed || (await isSuppressed(lead.organizationId, primaryEmail))) {
    throw new SuppressedLeadError("Ce prospect est désinscrit ou sur liste d'exclusion.");
  }

  const existing = await prisma.enrollment.findFirst({
    where: { leadId: params.leadId, sequenceId: params.sequenceId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] } },
  });
  if (existing) {
    throw new DuplicateEnrollmentError("Ce prospect est déjà inscrit dans cette séquence.");
  }

  const firstStep = await prisma.sequenceStep.findFirst({
    where: { sequenceId: params.sequenceId },
    orderBy: { order: "asc" },
  });

  const enrollment = await prisma.enrollment.create({
    data: {
      leadId: params.leadId,
      sequenceId: params.sequenceId,
      campaignId: params.campaignId ?? undefined,
      currentStepOrder: 0,
      nextRunAt: firstStep ? addDays(new Date(), firstStep.delayDays) : null,
    },
  });

  await prisma.lead.update({ where: { id: params.leadId }, data: { stage: LeadStage.FOLLOW_UP_SCHEDULED } });

  return enrollment;
}

/** Arrête toutes les inscriptions actives d'un prospect (arrêt automatique de séquence). */
export async function stopEnrollmentsForLead(leadId: string, reason: EnrollmentStopReason) {
  await prisma.enrollment.updateMany({
    where: { leadId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] } },
    data: { status: EnrollmentStatus.STOPPED, stopReason: reason, stoppedAt: new Date() },
  });
}

/**
 * Traite une étape de séquence arrivée à échéance : génère le message (IA), et
 * soit le met en attente de validation humaine, soit l'envoie immédiatement.
 */
async function runDueEnrollment(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      lead: { include: { contacts: true, organization: true } },
      sequence: { include: { steps: { orderBy: { order: "asc" } } } },
    },
  });

  if (enrollment.status !== EnrollmentStatus.ACTIVE) return;

  const lead = enrollment.lead;
  const primaryEmail = lead.contacts.find((c) => c.email)?.email ?? null;

  if (lead.isSuppressed || (await isSuppressed(lead.organizationId, primaryEmail))) {
    await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.SUPPRESSED);
    return;
  }

  const nextIndex = enrollment.currentStepOrder; // steps are 0-indexed internally, order field is 1-based
  const step = enrollment.sequence.steps[nextIndex];
  if (!step) {
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: EnrollmentStatus.COMPLETED, nextRunAt: null } });
    return;
  }

  if (!isWithinAllowedWindow(step, new Date())) {
    // Reporte d'une heure jusqu'à ce que la fenêtre autorisée soit atteinte.
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { nextRunAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    return;
  }

  const ai = await getAIProviderForOrganization(lead.organizationId);
  const org = lead.organization;
  const facts = leadToFacts(lead);
  const analysis = await prisma.leadAnalysis.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" } });

  const messageType = (Object.values(MessageType) as string[]).includes(step.templateKey)
    ? (step.templateKey as MessageType)
    : MessageType.FOLLOW_UP_SHORT;

  const generated = await ai.generateMessage({
    organization: {
      name: org.name,
      pitch: org.pitch,
      tone: org.tone,
      emailSignature: org.emailSignature,
      portfolioLinks: org.portfolioLinks,
    },
    lead: facts,
    analysis: analysis
      ? {
          summary: analysis.summary,
          clienteleType: analysis.clienteleType,
          digitalPresenceQuality: analysis.digitalPresenceQuality,
          hasVirtualTourAssessment: analysis.hasVirtualTourAssessment,
          opportunities: analysis.opportunities,
          recommendedAngle: analysis.recommendedAngle,
          recommendedService: analysis.recommendedService,
          priorityLevel: analysis.priorityLevel as "immediate" | "interessant" | "a_verifier" | "faible",
          personalizedArguments: analysis.personalizedArguments,
          negativeSignals: analysis.negativeSignals,
          verifiedFacts: analysis.verifiedFacts,
          estimatedFacts: analysis.estimatedFacts,
          missingInfo: analysis.missingInfo,
        }
      : null,
    type: messageType,
    tone: "PROFESSIONAL",
    language: "FR",
    unsubscribeUrl: unsubscribeUrl(lead.id),
  });

  const aiRequest = await prisma.aIRequest.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      kind: "GENERATE_MESSAGE",
      provider: ai.name,
      model: ai.model,
      prompt: JSON.stringify({ type: messageType, lead: facts }),
      response: JSON.stringify(generated),
      estimatedCostUsd: ai.estimateCostUsd(200, generated.body.length),
      status: step.requiresValidation ? "PENDING_VALIDATION" : "COMPLETED",
    },
  });

  const requiresValidation = step.requiresValidation;

  const message = await prisma.message.create({
    data: {
      leadId: lead.id,
      enrollmentId: enrollment.id,
      sequenceStepId: step.id,
      type: messageType,
      channel: step.channel,
      tone: "PROFESSIONAL",
      language: "FR",
      subject: generated.subject,
      body: generated.body,
      status: requiresValidation ? MessageStatus.PENDING_VALIDATION : MessageStatus.APPROVED,
      aiRequestId: aiRequest.id,
    },
  });

  if (requiresValidation) {
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: LeadStage.MESSAGE_TO_VALIDATE } });
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { nextRunAt: null } });
    await writeAuditLog({
      organizationId: lead.organizationId,
      leadId: lead.id,
      action: "sequence.message.pending_validation",
      entityType: "Message",
      entityId: message.id,
    });
    return;
  }

  await sendMessageNow(message.id);
}

export async function sendMessageNow(messageId: string) {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { lead: { include: { contacts: true, organization: true } }, enrollment: { include: { sequence: { include: { steps: true } } } } },
  });

  const primaryEmail = message.lead.contacts.find((c) => c.email)?.email;
  const emailProvider = getEmailProvider();

  if (message.lead.isSuppressed || (await isSuppressed(message.lead.organizationId, primaryEmail))) {
    await prisma.message.update({ where: { id: message.id }, data: { status: MessageStatus.FAILED } });
    await prisma.emailEvent.create({ data: { messageId: message.id, type: EmailEventType.FAILED, metadata: { reason: "suppressed" } } });
    if (message.enrollmentId) {
      await stopEnrollmentsForLead(message.lead.id, EnrollmentStopReason.SUPPRESSED);
    }
    return;
  }

  if (message.channel === SequenceChannel.EMAIL && !primaryEmail) {
    await prisma.message.update({ where: { id: message.id }, data: { status: MessageStatus.FAILED } });
    await prisma.emailEvent.create({ data: { messageId: message.id, type: EmailEventType.FAILED, metadata: { reason: "no_contact_email" } } });
    return;
  }

  if (message.channel === SequenceChannel.EMAIL && primaryEmail) {
    const emailAccount = await prisma.emailAccount.findFirst({ where: { organizationId: message.lead.organizationId, isActive: true } });

    const sentTodayCount = await prisma.message.count({
      where: {
        lead: { organizationId: message.lead.organizationId },
        status: MessageStatus.SENT,
        sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });
    const dailyLimit = emailAccount?.dailyLimit ?? message.lead.organization.dailySendLimit;
    if (sentTodayCount >= dailyLimit) {
      await prisma.message.update({ where: { id: message.id }, data: { status: MessageStatus.FAILED } });
      await prisma.emailEvent.create({ data: { messageId: message.id, type: EmailEventType.FAILED, metadata: { reason: "daily_limit_reached" } } });
      return;
    }

    const result = await emailProvider.send({
      fromName: emailAccount?.fromName ?? message.lead.organization.name,
      fromEmail: emailAccount?.fromEmail ?? "contact@demo.provence360.local",
      toEmail: primaryEmail,
      subject: message.subject ?? "",
      body: message.body,
      organizationId: message.lead.organizationId,
      messageId: message.id,
    });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: result.status === "sent" ? MessageStatus.SENT : MessageStatus.FAILED,
        sentAt: result.status === "sent" ? new Date() : undefined,
        providerMessageId: result.providerMessageId,
        emailAccountId: emailAccount?.id,
      },
    });

    await prisma.emailEvent.create({
      data: {
        messageId: message.id,
        type: result.status === "sent" ? EmailEventType.SENT : EmailEventType.BOUNCED,
        metadata: result.error ? { error: result.error } : undefined,
      },
    });

    if (result.status === "sent") {
      await prisma.lead.update({ where: { id: message.lead.id }, data: { stage: LeadStage.CONTACTED } });
    } else {
      await stopEnrollmentsForLead(message.lead.id, EnrollmentStopReason.INVALID_ADDRESS);
      await prisma.lead.update({ where: { id: message.lead.id }, data: { stage: LeadStage.TO_RECONTACT_LATER } });
      return;
    }
  } else {
    // Canaux non-email (LinkedIn, SMS, appel) : validés mais l'envoi reste manuel hors plateforme.
    await prisma.message.update({ where: { id: message.id }, data: { status: MessageStatus.SENT, sentAt: new Date() } });
  }

  if (message.enrollmentId) {
    await advanceEnrollment(message.enrollmentId);
  }
}

async function advanceEnrollment(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { sequence: { include: { steps: { orderBy: { order: "asc" } } } } },
  });
  if (enrollment.status !== EnrollmentStatus.ACTIVE) return;

  const nextStepIndex = enrollment.currentStepOrder + 1;
  const nextStep = enrollment.sequence.steps[nextStepIndex];

  if (!nextStep) {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: EnrollmentStatus.COMPLETED, currentStepOrder: nextStepIndex, nextRunAt: null },
    });
    return;
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { currentStepOrder: nextStepIndex, nextRunAt: addDays(enrollment.startedAt, nextStep.delayDays) },
  });
}

/** Point d'entrée du traitement planifié des séquences (appelé par la route cron ou manuellement en démo). */
export async function processDueSequences(now: Date = new Date()) {
  const due = await prisma.enrollment.findMany({
    where: { status: EnrollmentStatus.ACTIVE, nextRunAt: { lte: now } },
    select: { id: true },
  });
  const results: { enrollmentId: string; ok: boolean; error?: string }[] = [];
  for (const e of due) {
    try {
      await runDueEnrollment(e.id);
      results.push({ enrollmentId: e.id, ok: true });
    } catch (err) {
      results.push({ enrollmentId: e.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
