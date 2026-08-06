import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { resolveCustomAgentOrThrow, updateCustomAgent, archiveCustomAgent } from "@/lib/agents/custom/custom-agent-service";
import { updateCustomAgentSchema } from "@/lib/validations/custom-agent";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { id } = await params;
    const agent = await resolveCustomAgentOrThrow(actor, id);
    return NextResponse.json({ agent });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/custom-agents/[id]" });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = updateCustomAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const agent = await updateCustomAgent(actor, id, parsed.data);
    return NextResponse.json({ agent });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/custom-agents/[id]" });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const { id } = await params;
    const agent = await archiveCustomAgent(actor, id);
    return NextResponse.json({ agent });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/custom-agents/[id]" });
  }
}
