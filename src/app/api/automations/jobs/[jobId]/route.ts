import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getAutomationJobDetail } from "@/lib/automation/registry/automation-service";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { jobId } = await params;
    const detail = await getAutomationJobDetail(actor, jobId);
    return NextResponse.json(detail);
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/automations/jobs/[jobId]" });
  }
}
