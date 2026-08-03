import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { pipelineStageUpdateSchema, leadStageKeySchema } from "@/lib/validations/crm";
import { updatePipelineStage } from "@/lib/crm/pipeline-service";

type Params = { params: Promise<{ stageKey: string }> };

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { stageKey } = await params;

  const parsedStageKey = leadStageKeySchema.safeParse(stageKey);
  if (!parsedStageKey.success) {
    return NextResponse.json({ error: "Étape de pipeline inconnue." }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = pipelineStageUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const stage = await updatePipelineStage(actor.organization.id, parsedStageKey.data, parsed.data);
    return NextResponse.json({ stage });
  } catch (error) {
    return toApiErrorResponse(error, { route: "PUT /api/pipeline-stages/[stageKey]" });
  }
}
