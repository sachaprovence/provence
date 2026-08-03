import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { getAIProviderForOrganization } from "@/lib/ai";
import { QuotaExceededError } from "@/lib/errors";
import { generateMessageSchema } from "@/lib/validations/message";
import { unsubscribeUrl } from "@/lib/unsubscribe-token";
import { writeAuditLog } from "@/lib/audit";
import { withApiMetrics } from "@/lib/observability/api-metrics";
import { LeadStage, MessageStatus } from "@/generated/prisma/enums";

async function handlePost(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const body = await request.json().catch(() => null);
  const parsed = generateMessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  const { leadId, type, tone, language } = parsed.data;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: actor.organization.id },
    include: { contacts: true, organization: true },
  });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const analysis = await prisma.leadAnalysis.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });

  let ai;
  try {
    ai = await getAIProviderForOrganization(actor.organization.id);
  } catch (error) {
    if (error instanceof QuotaExceededError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    throw error;
  }
  const facts = {
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

  const generated = await ai.generateMessage({
    organization: {
      name: lead.organization.name,
      pitch: lead.organization.pitch,
      tone: lead.organization.tone,
      emailSignature: lead.organization.emailSignature,
      portfolioLinks: lead.organization.portfolioLinks,
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
    type,
    tone,
    language,
    unsubscribeUrl: unsubscribeUrl(lead.id),
  });

  const prompt = JSON.stringify({ type, tone, language, facts });
  const response = JSON.stringify(generated);
  const aiRequest = await prisma.aIRequest.create({
    data: {
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: lead.id,
      kind: "GENERATE_MESSAGE",
      provider: ai.name,
      model: ai.model,
      prompt,
      response,
      estimatedCostUsd: ai.estimateCostUsd(prompt.length, response.length),
      status: "PENDING_VALIDATION",
    },
  });

  const requireValidation = lead.organization.requireMessageValidation;

  const message = await prisma.message.create({
    data: {
      leadId: lead.id,
      type,
      tone,
      language,
      subject: generated.subject,
      body: generated.body,
      status: requireValidation ? MessageStatus.PENDING_VALIDATION : MessageStatus.APPROVED,
      aiRequestId: aiRequest.id,
    },
  });

  if (requireValidation) {
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: LeadStage.MESSAGE_TO_VALIDATE } });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "message.generated",
    entityType: "Message",
    entityId: message.id,
    metadata: { type, tone, language },
  });

  return NextResponse.json({ message });
}

// Route représentative instrumentée pour la latence API (AR-0049, v0.9 bis) — voir src/lib/observability/api-metrics.ts.
export const POST = withApiMetrics("POST /api/messages/generate", handlePost);
