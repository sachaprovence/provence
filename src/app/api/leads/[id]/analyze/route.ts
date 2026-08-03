import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { getAIProviderForOrganization } from "@/lib/ai";
import { QuotaExceededError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { LeadStage } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: actor.organization.id },
    include: { contacts: true },
  });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

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

  const analysisResult = await ai.analyzeLead(facts);

  const prompt = JSON.stringify(facts);
  const response = JSON.stringify(analysisResult);
  const aiRequest = await prisma.aIRequest.create({
    data: {
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: lead.id,
      kind: "ANALYZE_LEAD",
      provider: ai.name,
      model: ai.model,
      prompt,
      response,
      estimatedCostUsd: ai.estimateCostUsd(prompt.length, response.length),
      status: "COMPLETED",
    },
  });

  const analysis = await prisma.leadAnalysis.create({
    data: {
      leadId: lead.id,
      summary: analysisResult.summary,
      clienteleType: analysisResult.clienteleType,
      digitalPresenceQuality: analysisResult.digitalPresenceQuality,
      hasVirtualTourAssessment: analysisResult.hasVirtualTourAssessment,
      opportunities: analysisResult.opportunities,
      recommendedAngle: analysisResult.recommendedAngle,
      recommendedService: analysisResult.recommendedService,
      priorityLevel: analysisResult.priorityLevel,
      personalizedArguments: analysisResult.personalizedArguments,
      negativeSignals: analysisResult.negativeSignals,
      verifiedFacts: analysisResult.verifiedFacts,
      estimatedFacts: analysisResult.estimatedFacts,
      missingInfo: analysisResult.missingInfo,
      aiRequestId: aiRequest.id,
    },
  });

  if (lead.stage === LeadStage.NEW || lead.stage === LeadStage.TO_ANALYZE) {
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: LeadStage.QUALIFIED } });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "lead.analyzed",
    entityType: "LeadAnalysis",
    entityId: analysis.id,
  });

  return NextResponse.json({ analysis });
}
