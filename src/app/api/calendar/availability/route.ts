import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { getGoogleCalendarBusySlots } from "@/lib/calendar/google";

/** Disponibilités (brief v0.9 : "Disponibilités") — créneaux occupés sur la période demandée. */
export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "Paramètres from et to (ISO 8601) requis." }, { status: 400 });
  }

  try {
    const busy = await getGoogleCalendarBusySlots(actor.organization.id, from, to);
    return NextResponse.json({ busy });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/calendar/availability" });
  }
}
