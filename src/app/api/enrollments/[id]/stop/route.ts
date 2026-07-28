import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { stopEnrollmentsForLead } from "@/lib/sequence-engine";
import { EnrollmentStopReason } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { id } = await params;

  const enrollment = await prisma.enrollment.findFirst({
    where: { id, lead: { organizationId: actor.organization.id } },
  });
  if (!enrollment) return NextResponse.json({ error: "Inscription introuvable." }, { status: 404 });

  await stopEnrollmentsForLead(enrollment.leadId, EnrollmentStopReason.MANUAL);
  return NextResponse.json({ ok: true });
}
