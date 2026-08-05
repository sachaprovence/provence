import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { decideAction } from "@/lib/agents/commercial/commercial-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VALIDATE_MESSAGES");
    const { id } = await params;
    const action = await decideAction(actor, id, "REJECTED");
    return NextResponse.json({ action });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/commercial/actions/[id]/reject" });
  }
}
