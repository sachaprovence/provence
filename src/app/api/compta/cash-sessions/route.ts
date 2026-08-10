import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaCashSessionOpenSchema } from "@/lib/validations/compta";
import { listCashSessions, openCashSession } from "@/lib/compta/cash-session-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const cashSessions = await listCashSessions(actor.organization.id);
    return NextResponse.json({ cashSessions });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/cash-sessions" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);
  const parsed = comptaCashSessionOpenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const cashSession = await openCashSession(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ cashSession }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/cash-sessions" });
  }
}
