import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { listNotifications, countUnreadNotifications } from "@/lib/notifications/notification-service";
import { toApiErrorResponse } from "@/lib/errors";

/** Liste des notifications visibles par l'acteur courant (v1.4, AR-0184) — les siennes + les diffusions larges de son organisation. */
export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const limit = Number(url.searchParams.get("limit") ?? "20");

    const [notifications, unreadCount] = await Promise.all([
      listNotifications(actor, { unreadOnly, limit }),
      countUnreadNotifications(actor),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/notifications" });
  }
}
