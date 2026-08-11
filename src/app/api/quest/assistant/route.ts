import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { assistantMessageSchema } from "@/lib/validations/quest";
import { listConversations, postAssistantMessage } from "@/lib/quest/assistant-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const conversations = await listConversations(actor.user.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/assistant" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = assistantMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await postAssistantMessage(actor.user.id, parsed.data.conversationId, parsed.data.message);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/assistant" });
  }
}
