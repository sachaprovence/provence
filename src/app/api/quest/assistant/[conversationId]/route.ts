import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { listConversationMessages } from "@/lib/quest/assistant-service";

type Params = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { conversationId } = await params;

  try {
    const messages = await listConversationMessages(actor.user.id, conversationId);
    return NextResponse.json({ messages });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/assistant/[conversationId]" });
  }
}
