import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaVatRateUpdateSchema } from "@/lib/validations/compta";
import { updateVatRate } from "@/lib/compta/vat-rate-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

/** Renommer / modifier le taux / activer / désactiver — un seul point d'entrée, `isActive` n'est qu'un champ partiel parmi d'autres (voir vat-rate-service.ts#updateVatRate). */
export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaVatRateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const rate = await updateVatRate(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json({ rate });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/vat-rates/[id]" });
  }
}
