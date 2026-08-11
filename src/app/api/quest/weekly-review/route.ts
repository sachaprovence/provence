import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { computeWeeklyReview, getLatestWeeklyReview } from "@/lib/quest/weekly-review-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const review = await getLatestWeeklyReview(actor.user.id);
    return NextResponse.json({ review });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/weekly-review" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const review = await computeWeeklyReview(actor.user.id);
    return NextResponse.json({ review });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quest/weekly-review" });
  }
}
