import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { LeadStage } from "@/generated/prisma/enums";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { id } = await params;
  const existing = await prisma.quote.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const quote = await prisma.quote.update({
    where: { id },
    data: {
      status: parsed.data.status,
      sentAt: parsed.data.status === "SENT" ? new Date() : undefined,
      acceptedAt: parsed.data.status === "ACCEPTED" ? new Date() : undefined,
    },
  });

  if (parsed.data.status === "SENT") {
    await prisma.lead.update({ where: { id: existing.leadId }, data: { stage: LeadStage.QUOTE_SENT } });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: existing.leadId,
    action: "quote.status_changed",
    entityType: "Quote",
    entityId: id,
    metadata: { status: parsed.data.status },
  });

  return NextResponse.json({ quote });
}
