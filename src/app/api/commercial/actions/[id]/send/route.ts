import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { sendAction } from "@/lib/agents/commercial/commercial-service";

/** Marque une action APPROVED comme envoyée et fait progresser le pipeline du prospect (voir `commercial-service.ts#sendAction`). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VALIDATE_MESSAGES");
    const { id } = await params;
    const action = await sendAction(actor, id);
    return NextResponse.json({ action });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/commercial/actions/[id]/send" });
  }
}
