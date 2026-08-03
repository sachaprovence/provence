import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { getAIProviderForOrganization } from "@/lib/ai";
import { QuotaExceededError } from "@/lib/errors";
import { stopEnrollmentsForLead } from "@/lib/sequence-engine";
import { addSuppression } from "@/lib/suppression";
import { onPositiveReply } from "@/lib/automation-engine";
import { writeAuditLog } from "@/lib/audit";
import { EnrollmentStopReason, LeadStage, ReplyIntent, SuppressionReason } from "@/generated/prisma/enums";

const schema = z.object({
  body: z.string().min(1).max(4000),
  subject: z.string().optional(),
});

const PRESETS: Record<string, string> = {
  interested: "Bonjour, oui je suis intéressé, pouvons-nous prendre un rendez-vous cette semaine ?",
  price: "Bonjour, pourriez-vous m'indiquer vos tarifs pour une visite virtuelle ?",
  not_interested: "Bonjour, merci mais je ne suis pas intéressé pour le moment.",
  unsubscribe: "Merci de ne plus me contacter, je souhaite me désinscrire.",
  callback: "Pouvez-vous me rappeler demain matin ?",
};

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: actor.organization.id }, include: { contacts: true } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const rawBody = await request.json().catch(() => null);
  const preset = typeof rawBody?.preset === "string" ? PRESETS[rawBody.preset] : undefined;
  const parsed = schema.safeParse({ body: preset ?? rawBody?.body, subject: rawBody?.subject });
  if (!parsed.success) return NextResponse.json({ error: "Message invalide." }, { status: 400 });

  let ai;
  try {
    ai = await getAIProviderForOrganization(actor.organization.id);
  } catch (error) {
    if (error instanceof QuotaExceededError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    throw error;
  }
  const classification = await ai.classifyReply({ body: parsed.data.body, subject: parsed.data.subject });

  const aiRequest = await prisma.aIRequest.create({
    data: {
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: lead.id,
      kind: "CLASSIFY_REPLY",
      provider: ai.name,
      model: ai.model,
      prompt: parsed.data.body,
      response: JSON.stringify(classification),
      estimatedCostUsd: ai.estimateCostUsd(parsed.data.body.length, 40),
      status: "COMPLETED",
    },
  });

  const conversation = await prisma.conversation.create({
    data: {
      leadId: lead.id,
      direction: "inbound",
      fromAddress: lead.contacts.find((c) => c.email)?.email,
      toAddress: undefined,
      subject: parsed.data.subject,
      body: parsed.data.body,
      intent: classification.intent,
      aiRequestId: aiRequest.id,
    },
  });

  let nextStage: LeadStage = lead.stage;

  if (classification.intent === ReplyIntent.UNSUBSCRIBE) {
    const email = lead.contacts.find((c) => c.email)?.email;
    await addSuppression({ organizationId: actor.organization.id, email, reason: SuppressionReason.UNSUBSCRIBED });
    await prisma.lead.update({ where: { id: lead.id }, data: { isSuppressed: true, suppressedAt: new Date() } });
    await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.UNSUBSCRIBED);
    nextStage = LeadStage.UNSUBSCRIBED;
  } else if (classification.intent === ReplyIntent.INVALID_ADDRESS) {
    await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.INVALID_ADDRESS);
    nextStage = LeadStage.TO_RECONTACT_LATER;
  } else if (classification.intent === ReplyIntent.AUTO_REPLY) {
    // Une réponse automatique n'est pas considérée comme une réponse du prospect : la séquence continue.
  } else {
    await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.REPLIED);
    nextStage = classification.intent === ReplyIntent.INTERESTED ? LeadStage.INTERESTED : LeadStage.REPLIED;
    if (classification.intent === ReplyIntent.INTERESTED) {
      await onPositiveReply(lead.id, actor.organization.id);
    }
  }

  if (nextStage !== lead.stage) {
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: nextStage } });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "lead.reply_simulated",
    entityType: "Conversation",
    entityId: conversation.id,
    metadata: { intent: classification.intent },
  });

  return NextResponse.json({ conversation, intent: classification.intent, stage: nextStage });
}
