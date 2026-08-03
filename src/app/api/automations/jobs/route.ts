import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listAutomationJobsForWorkspace } from "@/lib/automation/registry/automation-service";

/** Liste les jobs du noyau (`AutomationJob`) du workspace, filtrable par statut (`?status=RUNNING`). */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? "50") || 50;
    const jobs = await listAutomationJobsForWorkspace(actor.workspace.id, { status, limit });
    return NextResponse.json({ jobs });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/automations/jobs" });
  }
}
