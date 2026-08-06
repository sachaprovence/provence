import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listConversations, createConversation } from "@/lib/agents/custom/custom-agent-service";
import { createConversationSchema } from "@/lib/validations/custom-agent";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { id } = await params;
    const conversations = await listConversations(actor, id);
    return NextResponse.json({ conversations });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/custom-agents/[id]/conversations" });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = createConversationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const conversation = await createConversation(actor, id, parsed.data.title);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/custom-agents/[id]/conversations" });
  }
}
