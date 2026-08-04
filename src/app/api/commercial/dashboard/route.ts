import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getCommercialDashboard } from "@/lib/agents/commercial/dashboard-service";
import { resolveCommercialInstallation } from "@/lib/agents/commercial/commercial-service";

export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const [installation, dashboard] = await Promise.all([
      resolveCommercialInstallation(actor.workspace.id),
      getCommercialDashboard(actor.workspace.id),
    ]);
    return NextResponse.json({ installation, dashboard });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/commercial/dashboard" });
  }
}
