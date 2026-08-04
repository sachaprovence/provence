import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { startOrganizationCheckout } from "@/lib/billing/subscription-service";
import { toApiErrorResponse } from "@/lib/errors";
import { PlanKey } from "@/generated/prisma/enums";

/** Démarre (ou active directement en mode démo) un abonnement pour le plan demandé (v1.0, AR-0063/AR-0064). */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const body = await request.json().catch(() => null);
  const planKey = body?.planKey as PlanKey | undefined;
  if (!planKey || !Object.values(PlanKey).includes(planKey)) {
    return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  try {
    const outcome = await startOrganizationCheckout({
      organizationId: actor.organization.id,
      planKey,
      requesterEmail: actor.user.email,
      requesterName: `${actor.user.firstName} ${actor.user.lastName}`,
      successUrl: `${origin}/settings/billing?checkout=success`,
      cancelUrl: `${origin}/settings/billing?checkout=cancel`,
    });
    return NextResponse.json(outcome);
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/billing/checkout" });
  }
}
