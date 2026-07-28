import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { opportunityUpdateSchema } from "@/lib/validations/quote";
import { onDealWon } from "@/lib/automation-engine";
import { writeAuditLog } from "@/lib/audit";
import { LeadStage } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const existing = await prisma.opportunity.findFirst({ where: { id, organizationId: actor.organization.id }, include: { lead: true } });
  if (!existing) return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = opportunityUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const opportunity = await prisma.opportunity.update({ where: { id }, data: parsed.data });

  if (parsed.data.status === "WON") {
    await prisma.lead.update({ where: { id: existing.leadId }, data: { stage: LeadStage.WON } });
    await onDealWon(existing.leadId, actor.organization.id);
  } else if (parsed.data.status === "LOST") {
    await prisma.lead.update({ where: { id: existing.leadId }, data: { stage: LeadStage.LOST } });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: existing.leadId,
    action: "opportunity.updated",
    entityType: "Opportunity",
    entityId: id,
    metadata: { status: parsed.data.status },
  });

  return NextResponse.json({ opportunity });
}
