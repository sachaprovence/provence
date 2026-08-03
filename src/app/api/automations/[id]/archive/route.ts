import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { archiveAutomation } from "@/lib/automation/registry/automation-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { id } = await params;
    const automation = await archiveAutomation(actor, id);
    return NextResponse.json({ automation });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/automations/[id]/archive" });
  }
}
