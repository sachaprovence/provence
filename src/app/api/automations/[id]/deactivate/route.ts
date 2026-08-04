import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { deactivateAutomation } from "@/lib/automation/registry/automation-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { id } = await params;
    const automation = await deactivateAutomation(actor, id);
    return NextResponse.json({ automation });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/automations/[id]/deactivate" });
  }
}
