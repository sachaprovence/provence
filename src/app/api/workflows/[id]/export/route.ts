import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { exportWorkflowDefinition } from "@/lib/workflows/workflow-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { id } = await params;
    const payload = await exportWorkflowDefinition(actor, id);
    return NextResponse.json(payload, {
      headers: { "Content-Disposition": `attachment; filename="${payload.key}.json"` },
    });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/workflows/[id]/export" });
  }
}
