import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { computeScore, DEFAULT_SCORING_RULES, SCORE_CATEGORY_LABEL, type ScoringRule } from "@/lib/scoring";
import { isSuppressed } from "@/lib/suppression";
import { onLeadScoreComputed } from "@/lib/automation-engine";
import { writeAuditLog } from "@/lib/audit";
import { LAUNCH_ZONES } from "@/lib/bootstrap";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";

/** Seuil de score à partir duquel un prospect est considéré prioritaire (v1.4, AR-0181) — même seuil que `onLeadScoreComputed` (Task de validation, système historique distinct). */
const PRIORITY_SCORE_THRESHOLD = 80;

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: actor.organization.id },
    include: { contacts: true, territory: true },
  });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } });
  const rules = (org.scoringRules as unknown as ScoringRule[] | null) ?? DEFAULT_SCORING_RULES;

  const primaryEmail = lead.contacts.find((c) => c.email)?.email ?? null;
  const suppressed = lead.isSuppressed || (await isSuppressed(actor.organization.id, primaryEmail));

  const lastMessage = await prisma.message.findFirst({
    where: { leadId: lead.id, status: "SENT" },
    orderBy: { sentAt: "desc" },
  });
  const recentlyContactedDays = lastMessage?.sentAt
    ? Math.floor((Date.now() - lastMessage.sentAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const result = computeScore(
    {
      establishmentName: lead.establishmentName,
      category: lead.category,
      hasVirtualTour: lead.hasVirtualTour,
      reviewCount: lead.reviewCount,
      averageRating: lead.averageRating,
      websiteUrl: lead.websiteUrl,
      socialLinks: (lead.socialLinks as Record<string, string> | null) ?? null,
      address: lead.address,
      inZone: lead.territory ? LAUNCH_ZONES.includes(lead.territory.name) : Boolean(lead.city && LAUNCH_ZONES.includes(lead.city)),
      recentlyContactedDays,
      isSuppressed: suppressed,
      closedBusiness: lead.closedBusiness,
    },
    rules
  );

  // Calculé AVANT la création du nouveau score — sinon `result.value` lui-même y apparaîtrait
  // déjà et la transition "devient prioritaire" ne serait jamais détectée.
  const wasAlreadyPriority =
    result.value >= PRIORITY_SCORE_THRESHOLD &&
    (await prisma.leadScore.findFirst({ where: { leadId: lead.id, value: { gte: PRIORITY_SCORE_THRESHOLD } } })) !== null;

  const score = await prisma.leadScore.create({
    data: {
      leadId: lead.id,
      value: result.value,
      category: result.category,
      breakdown: result.breakdown as never,
    },
  });

  await onLeadScoreComputed(lead.id, actor.organization.id, result.value);

  // Évènement Automation Engine (v1.4, AR-0181) — distinct du système historique ci-dessus
  // (`onLeadScoreComputed`, Task de validation, activable/désactivable par règle d'organisation) :
  // publié uniquement à la PREMIÈRE transition vers le seuil de priorité, jamais à chaque
  // nouveau score déjà au-dessus (évite de redéclencher le template à chaque re-scoring).
  if (result.value >= PRIORITY_SCORE_THRESHOLD && !wasAlreadyPriority) {
    await publishAutomationEvent("lead.became_priority", { organizationId: actor.organization.id, leadId: lead.id, scoreValue: result.value });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "lead.scored",
    entityType: "LeadScore",
    entityId: score.id,
    metadata: { value: result.value, category: result.category },
  });

  return NextResponse.json({ score, categoryLabel: SCORE_CATEGORY_LABEL[result.category] });
}
