import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { checkInSchema } from "@/lib/validations/quest";
import { createCheckIn, getLatestCheckIn } from "@/lib/quest/checkin-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const checkIn = await getLatestCheckIn(actor.user.id);
    return NextResponse.json({ checkIn });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/checkins" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = checkInSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const checkIn = await createCheckIn(actor.user.id, parsed.data);
    return NextResponse.json({ checkIn }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/checkins" });
  }
}
