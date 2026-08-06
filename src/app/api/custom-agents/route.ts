import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listCustomAgents, createCustomAgent } from "@/lib/agents/custom/custom-agent-service";
import { createCustomAgentSchema } from "@/lib/validations/custom-agent";

/** Liste les agents personnalisés du workspace et permet d'en créer un nouveau. */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
    const agents = await listCustomAgents(actor, { includeArchived });
    return NextResponse.json({ agents });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/custom-agents" });
  }
}

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const body = await request.json().catch(() => ({}));
    const parsed = createCustomAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const agent = await createCustomAgent(actor, parsed.data);
    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/custom-agents" });
  }
}
