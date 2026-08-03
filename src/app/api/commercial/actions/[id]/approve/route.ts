import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { decideAction } from "@/lib/agents/commercial/commercial-service";

/** Approbation humaine d'une action proposée par l'Agent Commercial (voir ADR 0017 : aucune action envoyée sans validation). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VALIDATE_MESSAGES");
    const { id } = await params;
    const action = await decideAction(actor, id, "APPROVED");
    return NextResponse.json({ action });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/commercial/actions/[id]/approve" });
  }
}
