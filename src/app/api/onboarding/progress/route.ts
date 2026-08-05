import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { getOrCreateOnboardingProgress, getOnboardingDemoResult } from "@/lib/onboarding/onboarding-service";
import { toApiErrorResponse } from "@/lib/errors";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const progress = await getOrCreateOnboardingProgress(actor.organization.id);
    const demoResult = await getOnboardingDemoResult(actor.organization.id);
    return NextResponse.json({ progress, demoResult });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/onboarding/progress" });
  }
}
