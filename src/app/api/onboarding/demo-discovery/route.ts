import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { launchDemoDiscovery } from "@/lib/onboarding/demo-discovery-service";

/** "Découvrir Autorun" (v1.6) — provisionne en un clic workflows/agents/automatisations/connecteurs de démonstration. */
export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const result = await launchDemoDiscovery(actor);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/onboarding/demo-discovery" });
  }
}
