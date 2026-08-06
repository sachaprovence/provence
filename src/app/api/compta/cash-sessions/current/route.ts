import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { getOpenSession, getPaymentBreakdown } from "@/lib/compta/cash-session-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const cashSession = await getOpenSession(actor.organization.id);
    if (!cashSession) return NextResponse.json({ cashSession: null, breakdown: null });

    const breakdown = await getPaymentBreakdown(actor.organization.id, { openedAt: cashSession.openedAt, closedAt: null });
    return NextResponse.json({ cashSession, breakdown });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/cash-sessions/current" });
  }
}
