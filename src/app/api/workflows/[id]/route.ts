import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getDefinitionDetail } from "@/lib/workflows/workflow-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { id } = await params;
    const detail = await getDefinitionDetail(actor, id);
    return NextResponse.json(detail);
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/workflows/[id]" });
  }
}
