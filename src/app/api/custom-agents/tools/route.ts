import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listAvailableTools } from "@/lib/agents/custom/custom-agent-service";

/** Catalogue des outils déclaratifs disponibles (voir `AgentTool`) — pour le formulaire de création d'agent personnalisé. */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const tools = await listAvailableTools();
    return NextResponse.json({ tools });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/custom-agents/tools" });
  }
}
