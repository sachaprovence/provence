import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getRunDetail } from "@/lib/workflows/workflow-service";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { runId } = await params;
    const detail = await getRunDetail(actor, runId);
    return NextResponse.json(detail);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/workflows/runs/[runId]" });
  }
}
