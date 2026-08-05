import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { markNotificationRead } from "@/lib/notifications/notification-service";
import { toApiErrorResponse } from "@/lib/errors";

type Params = { params: Promise<{ id: string }> };

/** Marque une notification comme lue (v1.4, AR-0184) — scopée strictement à l'acteur (voir `markNotificationRead`). */
export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    const marked = await markNotificationRead(actor, id);
    if (!marked) return NextResponse.json({ error: "Notification introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/notifications/[id]" });
  }
}
