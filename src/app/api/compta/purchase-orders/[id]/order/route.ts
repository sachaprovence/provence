import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { markPurchaseOrderOrdered } from "@/lib/compta/purchase-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;

  try {
    const purchaseOrder = await markPurchaseOrderOrdered(actor.organization.id, id, actor.user.id);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/purchase-orders/[id]/order" });
  }
}
