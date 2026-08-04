import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { changeOrganizationPlan } from "@/lib/billing/subscription-service";
import { toApiErrorResponse } from "@/lib/errors";
import { PlanKey } from "@/generated/prisma/enums";

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const body = await request.json().catch(() => null);
  const planKey = body?.planKey as PlanKey | undefined;
  if (!planKey || !Object.values(PlanKey).includes(planKey)) {
    return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  }

  try {
    await changeOrganizationPlan(actor.organization.id, planKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/billing/change-plan" });
  }
}
