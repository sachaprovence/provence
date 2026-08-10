import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaOrderRenameSchema } from "@/lib/validations/compta";
import { getOrder, renameOrder } from "@/lib/compta/order-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const order = await getOrder(actor.organization.id, id);
    return NextResponse.json({ order });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/orders/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = comptaOrderRenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const order = await renameOrder(actor.organization.id, id, parsed.data.name, actor.user.id);
    return NextResponse.json({ order });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/orders/[id]" });
  }
}
