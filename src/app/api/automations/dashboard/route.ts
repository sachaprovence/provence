import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getAutomationDashboard } from "@/lib/automation/dashboard-service";

export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const dashboard = await getAutomationDashboard(actor.workspace.id);
    return NextResponse.json({ dashboard });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/automations/dashboard" });
  }
}
