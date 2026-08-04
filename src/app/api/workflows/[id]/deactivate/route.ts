import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { deactivateDefinition } from "@/lib/workflows/workflow-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const { id } = await params;
    const definition = await deactivateDefinition(actor, id);
    return NextResponse.json({ definition });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/workflows/[id]/deactivate" });
  }
}
