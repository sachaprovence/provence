import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { questFeedbackNoteSchema } from "@/lib/validations/quest";
import { postponeQuest } from "@/lib/quest/quest-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const rawBody = await request.json().catch(() => ({}));
  const parsed = questFeedbackNoteSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await postponeQuest(actor.user.id, id, parsed.data.note);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/quests/[id]/postpone" });
  }
}
