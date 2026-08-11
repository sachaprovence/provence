import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { getTodaySnapshot } from "@/lib/quest/dashboard-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const snapshot = await getTodaySnapshot(actor.user.id);
    return NextResponse.json(snapshot);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/today" });
  }
}
