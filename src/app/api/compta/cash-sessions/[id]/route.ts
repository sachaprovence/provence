import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { getCashSession, getSessionPaymentBreakdown } from "@/lib/compta/cash-session-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const cashSession = await getCashSession(actor.organization.id, id);
    const breakdown = await getSessionPaymentBreakdown(actor.organization.id, id);
    return NextResponse.json({ cashSession, breakdown });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/cash-sessions/[id]" });
  }
}
