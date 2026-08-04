import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { cancelOrganizationSubscription } from "@/lib/billing/subscription-service";
import { toApiErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  try {
    await cancelOrganizationSubscription(actor.organization.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/billing/cancel" });
  }
}
