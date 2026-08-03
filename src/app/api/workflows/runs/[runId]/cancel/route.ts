import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { resolveRunForActor } from "@/lib/workflows/workflow-service";
import { cancelWorkflowRun } from "@/lib/workflows/execution-engine";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const { runId } = await params;
    await resolveRunForActor(actor, runId); // vérifie l'isolation tenant avant toute mutation.
    const run = await cancelWorkflowRun(runId);
    return NextResponse.json({ run });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workflows/runs/[runId]/cancel" });
  }
}
