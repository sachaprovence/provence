import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { exportOrganizationData } from "@/lib/compta/backup-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();

  try {
    const payload = await exportOrganizationData(actor.organization.id);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="compta-vellano-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/backup/export" });
  }
}
