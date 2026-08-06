import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaSaleRefundSchema } from "@/lib/validations/compta";
import { refundSale } from "@/lib/compta/sale-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = comptaSaleRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const refund = await refundSale(actor.organization.id, id, parsed.data.reason, actor.user.id);
    return NextResponse.json({ sale: refund }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/sales/[id]/refund" });
  }
}
