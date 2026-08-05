import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse } from "@/lib/workspace-context";
import { launchOnboardingDemo } from "@/lib/onboarding/onboarding-service";
import { toApiErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const progress = await launchOnboardingDemo(actor);
    return NextResponse.json({ progress });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/onboarding/launch-demo" });
  }
}
