import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { getPipelineStages } from "@/lib/crm/pipeline-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const stages = await getPipelineStages(actor.organization.id);
    return NextResponse.json({ stages });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/pipeline-stages" });
  }
}
