import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { pipelineStageReorderSchema } from "@/lib/validations/crm";
import { reorderPipelineStages } from "@/lib/crm/pipeline-service";

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  try {
    const body = await request.json().catch(() => null);
    const parsed = pipelineStageReorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const stages = await reorderPipelineStages(actor.organization.id, parsed.data.orderedStageKeys);
    return NextResponse.json({ stages });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/pipeline-stages/reorder" });
  }
}
