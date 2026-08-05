import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { markAllNotificationsRead } from "@/lib/notifications/notification-service";
import { toApiErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const count = await markAllNotificationsRead(actor);
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/notifications/mark-all-read" });
  }
}
