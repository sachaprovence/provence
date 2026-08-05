import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { retryWorkflowRun } from "@/lib/workflows/workflow-service";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const { runId } = await params;
    const run = await retryWorkflowRun(actor, runId);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/workflows/runs/[runId]/retry" });
  }
}
