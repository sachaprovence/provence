import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { archiveWorkspace } from "@/lib/workspace-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const workspace = await archiveWorkspace(actor, id);
    return NextResponse.json({ workspace });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workspaces/[id]/archive" });
  }
}
