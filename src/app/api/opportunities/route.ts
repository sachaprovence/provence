import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { opportunitySchema } from "@/lib/validations/quote";
import { writeAuditLog } from "@/lib/audit";
import { LeadStage } from "@/generated/prisma/enums";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");
  const status = searchParams.get("status");

  const opportunities = await prisma.opportunity.findMany({
    where: { organizationId: actor.organization.id, ...(leadId ? { leadId } : {}), ...(status ? { status: status as never } : {}) },
    include: { lead: true, quotes: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ opportunities });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = opportunitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const lead = await prisma.lead.findFirst({ where: { id: parsed.data.leadId, organizationId: actor.organization.id } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const opportunity = await prisma.opportunity.create({
    data: { organizationId: actor.organization.id, ...parsed.data },
  });

  if (lead.stage !== LeadStage.NEGOTIATION && lead.stage !== LeadStage.WON) {
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: LeadStage.NEGOTIATION } });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "opportunity.created",
    entityType: "Opportunity",
    entityId: opportunity.id,
  });

  return NextResponse.json({ opportunity }, { status: 201 });
}
