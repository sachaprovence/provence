import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { getSale, deleteSale } from "@/lib/compta/sale-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const sale = await getSale(actor.organization.id, id);
    return NextResponse.json({ sale });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/sales/[id]" });
  }
}

/** Suppression pure (jamais depuis l'interface normale — réservée à l'administrateur, voir cancel/refund pour l'usage courant). */
export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;

  try {
    await deleteSale(actor.organization.id, id, actor.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/compta/sales/[id]" });
  }
}
