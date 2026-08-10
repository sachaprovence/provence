import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaOrderCancelSchema } from "@/lib/validations/compta";
import { cancelOrder } from "@/lib/compta/order-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = comptaOrderCancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const order = await cancelOrder(actor.organization.id, id, parsed.data.reason, actor.user.id);
    return NextResponse.json({ order });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/orders/[id]/cancel" });
  }
}
