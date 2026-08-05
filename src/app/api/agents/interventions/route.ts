import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listInterventionRequests } from "@/lib/agents/messaging";

export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const interventions = await listInterventionRequests({
      workspaceId: actor.workspace.id,
      status: status as never,
    });
    return NextResponse.json({ interventions });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/agents/interventions" });
  }
}
