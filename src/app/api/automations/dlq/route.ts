import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listDeadLetters } from "@/lib/automation/dlq";

/** Dead Letter Queue du workspace — jobs dont les tentatives sont épuisées, en attente d'une décision explicite (relance ou abandon). */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50") || 50;
    const jobs = await listDeadLetters({ organizationId: actor.organization.id, workspaceId: actor.workspace.id, limit });
    return NextResponse.json({ jobs });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/automations/dlq" });
  }
}
