import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listMessages, sendMessage } from "@/lib/agents/custom/custom-agent-service";
import { sendMessageSchema } from "@/lib/validations/custom-agent";

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { conversationId } = await params;
    const messages = await listMessages(actor, conversationId);
    return NextResponse.json({ messages });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/custom-agent-conversations/[conversationId]/messages" });
  }
}

/** Envoie un message utilisateur et renvoie la réponse de l'agent (synchrone — pas de streaming en v1.6). */
export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { conversationId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await sendMessage(actor, conversationId, parsed.data.content);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/custom-agent-conversations/[conversationId]/messages" });
  }
}
