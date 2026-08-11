import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { memoryUpdateSchema } from "@/lib/validations/quest";
import { confirmMemory, deleteMemory } from "@/lib/quest/memory-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = memoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.action === "CONFIRM") {
      const memory = await confirmMemory(actor.user.id, id);
      return NextResponse.json({ memory });
    }
    await deleteMemory(actor.user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/quest/memories/[id]" });
  }
}
