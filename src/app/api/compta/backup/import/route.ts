import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { importOrganizationData } from "@/lib/compta/backup-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

/** Restauration destructrice (remplace TOUTES les données Compta de l'organisation) — réservée à l'administrateur, voir `backup-service.ts`. */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);

  try {
    await importOrganizationData(actor.organization.id, body, actor.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/backup/import" });
  }
}
