import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaOrderItemUpdateSchema } from "@/lib/validations/compta";
import { updateOrderItemQuantity, removeOrderItem } from "@/lib/compta/order-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string; itemId: string }> };

/** `quantity: 0` supprime la ligne (voir order-service.ts#updateOrderItemQuantity) — pas de code d'erreur pour ce cas, c'est un comportement attendu. */
export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id, itemId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaOrderItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const order = await updateOrderItemQuantity(actor.organization.id, id, itemId, parsed.data.quantity, actor.user.id);
    return NextResponse.json({ order });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/orders/[id]/items/[itemId]" });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id, itemId } = await params;

  try {
    const order = await removeOrderItem(actor.organization.id, id, itemId, actor.user.id);
    return NextResponse.json({ order });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/compta/orders/[id]/items/[itemId]" });
  }
}
