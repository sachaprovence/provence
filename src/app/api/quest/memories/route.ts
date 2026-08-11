import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { listMemories } from "@/lib/quest/memory-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const memories = await listMemories(actor.user.id);
    return NextResponse.json({ memories });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/memories" });
  }
}
