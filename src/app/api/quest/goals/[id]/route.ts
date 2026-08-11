import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { goalStatusUpdateSchema } from "@/lib/validations/quest";
import { getGoalDetail, setGoalStatus } from "@/lib/quest/goal-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const detail = await getGoalDetail(actor.user.id, id);
    return NextResponse.json(detail);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/goals/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = goalStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const goal = await setGoalStatus(actor.user.id, id, parsed.data.status);
    return NextResponse.json({ goal });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/quest/goals/[id]" });
  }
}
