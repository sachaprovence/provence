import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { leadWhereForActor } from "@/lib/permissions";
import { leadCreateSchema } from "@/lib/validations/lead";
import { writeAuditLog } from "@/lib/audit";
import { isSuppressed } from "@/lib/suppression";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { withApiMetrics } from "@/lib/observability/api-metrics";
import { LeadSourceType } from "@/generated/prisma/enums";

async function handleGet(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage");
  const category = searchParams.get("category");
  const city = searchParams.get("city");
  const search = searchParams.get("q");
  const campaignId = searchParams.get("campaignId");
  const minScore = searchParams.get("minScore");

  const leads = await prisma.lead.findMany({
    where: {
      ...leadWhereForActor(actor),
      ...(stage ? { stage: stage as never } : {}),
      ...(category ? { category: category as never } : {}),
      ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(search
        ? {
            OR: [
              { establishmentName: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      contacts: true,
      tagsRelation: true,
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      territory: true,
      icp: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const filtered = minScore
    ? leads.filter((l) => (l.scores[0]?.value ?? 0) >= Number(minScore))
    : leads;

  return NextResponse.json({ leads: filtered });
}

async function handlePost(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const body = await request.json().catch(() => null);
  const parsed = leadCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const suppressed = data.contactEmail ? await isSuppressed(actor.organization.id, data.contactEmail) : false;

  const source = await prisma.leadSource.create({
    data: { organizationId: actor.organization.id, type: LeadSourceType.MANUAL, label: "Saisie manuelle", importedById: actor.user.id },
  });

  const lead = await prisma.lead.create({
    data: {
      organizationId: actor.organization.id,
      establishmentName: data.establishmentName,
      category: data.category,
      isSuppressed: suppressed,
      suppressedAt: suppressed ? new Date() : undefined,
      icpId: data.icpId || undefined,
      territoryId: data.territoryId || undefined,
      websiteUrl: data.websiteUrl || undefined,
      publicListingUrl: data.publicListingUrl || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      region: data.region || undefined,
      country: data.country || "France",
      reviewCount: data.reviewCount ?? undefined,
      averageRating: data.averageRating ?? undefined,
      hasVirtualTour: data.hasVirtualTour ?? undefined,
      sourceId: source.id,
      contacts:
        data.contactName || data.contactEmail || data.contactPhone
          ? {
              create: [
                {
                  fullName: data.contactName || undefined,
                  email: data.contactEmail || undefined,
                  phone: data.contactPhone || undefined,
                  jobTitle: data.contactJobTitle || undefined,
                },
              ],
            }
          : undefined,
    },
    include: { contacts: true },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "lead.created",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { source: "manual" },
  });
  await publishAutomationEvent("lead.created", { organizationId: actor.organization.id, leadId: lead.id });

  return NextResponse.json(
    {
      lead,
      warning: suppressed
        ? "Cet email figure sur la liste d'exclusion : le prospect a été créé mais restera bloqué pour tout envoi."
        : undefined,
    },
    { status: 201 }
  );
}

// Route représentative instrumentée pour la latence API (AR-0049, v0.9 bis) — voir src/lib/observability/api-metrics.ts.
export const GET = withApiMetrics("GET /api/leads", handleGet);
export const POST = withApiMetrics("POST /api/leads", handlePost);
