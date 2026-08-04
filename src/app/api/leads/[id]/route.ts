import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { leadUpdateSchema } from "@/lib/validations/lead";
import { writeAuditLog } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { buildStageChangedEventPayload } from "@/lib/crm/pipeline-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: actor.organization.id },
    include: {
      contacts: true,
      tagsRelation: true,
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      messages: { orderBy: { createdAt: "desc" } },
      conversations: { orderBy: { createdAt: "desc" } },
      enrollments: { include: { sequence: true }, orderBy: { startedAt: "desc" } },
      appointments: { orderBy: { startAt: "desc" } },
      opportunities: { include: { quotes: true }, orderBy: { createdAt: "desc" } },
      quotes: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { createdAt: "desc" } },
      icp: true,
      territory: true,
      campaign: true,
    },
  });

  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const existing = await prisma.lead.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = leadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      establishmentName: data.establishmentName,
      category: data.category,
      stage: data.stage,
      icpId: data.icpId || undefined,
      territoryId: data.territoryId || undefined,
      websiteUrl: data.websiteUrl || undefined,
      publicListingUrl: data.publicListingUrl || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      region: data.region || undefined,
      reviewCount: data.reviewCount ?? undefined,
      averageRating: data.averageRating ?? undefined,
      hasVirtualTour: data.hasVirtualTour ?? undefined,
      closedBusiness: data.closedBusiness,
      assignedToId: data.assignedToId || undefined,
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "lead.updated",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { fields: Object.keys(body ?? {}) },
  });
  await publishAutomationEvent("lead.updated", { organizationId: actor.organization.id, leadId: lead.id });

  // v1.1, AR-0165 — évènement granulaire dédié, publié UNIQUEMENT si l'étape a réellement changé
  // (jamais sur les autres champs), pour que les automatisations puissent s'abonner à une transition précise.
  const stageChangedPayload = buildStageChangedEventPayload(actor.organization.id, lead.id, existing.stage, data.stage);
  if (stageChangedPayload) await publishAutomationEvent("lead.stage_changed", stageChangedPayload);

  return NextResponse.json({ lead });
}

export async function DELETE(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  const existing = await prisma.lead.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  await prisma.lead.delete({ where: { id } });
  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "lead.deleted",
    entityType: "Lead",
    entityId: id,
  });
  await publishAutomationEvent("lead.deleted", { organizationId: actor.organization.id, leadId: id });

  return NextResponse.json({ ok: true });
}
