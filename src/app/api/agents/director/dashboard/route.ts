import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getDirectorDashboard, resolveDirectorInstallation } from "@/lib/agents/director/dashboard-service";

export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    const [director, dashboard] = await Promise.all([
      resolveDirectorInstallation(actor.workspace.id),
      getDirectorDashboard(actor.workspace.id),
    ]);

    return NextResponse.json({ director, dashboard });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/agents/director/dashboard" });
  }
}
