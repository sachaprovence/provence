import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { answerClarifyingQuestionsSchema } from "@/lib/validations/quest";
import { submitClarifyingAnswers } from "@/lib/quest/goal-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = answerClarifyingQuestionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await submitClarifyingAnswers(actor.user.id, id, parsed.data.answers);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/goals/[id]/answers" });
  }
}
