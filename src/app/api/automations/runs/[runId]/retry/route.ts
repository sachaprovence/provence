import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { retryAutomationRun } from "@/lib/automation/executor";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { runId } = await params;
    const run = await retryAutomationRun(actor, runId);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/automations/runs/[runId]/retry" });
  }
}
