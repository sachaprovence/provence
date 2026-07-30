import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { resolveAutomationRunForActor } from "@/lib/automation/registry/automation-service";
import { cancelAutomationRun } from "@/lib/automation/executor";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { runId } = await params;
    await resolveAutomationRunForActor(actor, runId); // vérifie l'isolation tenant avant toute mutation.
    const run = await cancelAutomationRun(runId);
    return NextResponse.json({ run });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/automations/runs/[runId]/cancel" });
  }
}
