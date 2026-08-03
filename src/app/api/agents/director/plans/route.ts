import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listPlans } from "@/lib/agents/director/planning-engine";

export async function GET() {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const plans = await listPlans({ workspaceId: actor.workspace.id });
    return NextResponse.json({ plans });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/agents/director/plans" });
  }
}
