import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { completeQuest } from "@/lib/quest/quest-service";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ actualMinutes: z.coerce.number().int().min(1).max(1000).optional().nullable() });

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quest = await completeQuest(actor.user.id, id, parsed.data.actualMinutes);
    return NextResponse.json({ quest });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/quests/[id]/complete" });
  }
}
