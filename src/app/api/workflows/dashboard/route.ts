import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getWorkflowDashboard } from "@/lib/workflows/dashboard-service";

export async function GET() {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const dashboard = await getWorkflowDashboard(actor.workspace.id);
    return NextResponse.json({ dashboard });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/workflows/dashboard" });
  }
}
