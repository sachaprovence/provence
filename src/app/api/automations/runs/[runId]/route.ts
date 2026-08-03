import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getAutomationRunDetail } from "@/lib/automation/registry/automation-service";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { runId } = await params;
    const detail = await getAutomationRunDetail(actor, runId);
    return NextResponse.json(detail);
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/automations/runs/[runId]" });
  }
}
