import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getPlanGraph } from "@/lib/agents/director/dashboard-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const { id } = await params;
    const graph = await getPlanGraph(actor.workspace.id, id);
    return NextResponse.json(graph);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/agents/director/plans/[id]" });
  }
}
