import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listAvailableLlmProviders } from "@/lib/agents/custom/custom-agent-service";

/** Fournisseurs LLM enregistrés (voir `src/lib/agents/llm/registry.ts`) — pour le formulaire de création d'agent personnalisé. */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const providers = listAvailableLlmProviders();
    return NextResponse.json({ providers });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/custom-agents/providers" });
  }
}
