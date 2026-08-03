import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { getOrganizationBillingSummary } from "@/lib/billing/subscription-service";
import { listPlans } from "@/lib/billing/plan-service";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const [summary, plans] = await Promise.all([getOrganizationBillingSummary(actor.organization.id), listPlans()]);
  return NextResponse.json({ summary, plans });
}
