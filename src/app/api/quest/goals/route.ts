import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { createGoalSchema } from "@/lib/validations/quest";
import { createGoal, listGoals } from "@/lib/quest/goal-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const goals = await listGoals(actor.user.id);
    return NextResponse.json({ goals });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/goals" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createGoal(actor.user.id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/goals" });
  }
}
