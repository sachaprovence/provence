import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getKnowledgeDashboard } from "@/lib/knowledge/dashboard-service";
import { getMemoryDashboard } from "@/lib/memory/dashboard-service";

export async function GET() {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const [knowledge, memory] = await Promise.all([
      getKnowledgeDashboard(actor.workspace.id),
      getMemoryDashboard(actor.organization.id),
    ]);
    return NextResponse.json({ knowledge, memory });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/knowledge/dashboard" });
  }
}
