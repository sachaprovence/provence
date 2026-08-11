import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { markTooEasy } from "@/lib/quest/quest-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const quest = await markTooEasy(actor.user.id, id);
    return NextResponse.json({ quest });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/quests/[id]/too-easy" });
  }
}
