import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { listComptaActivityLog } from "@/lib/compta/backup-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();

  try {
    const entries = await listComptaActivityLog(actor.organization.id);
    return NextResponse.json({ entries });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/historique" });
  }
}
