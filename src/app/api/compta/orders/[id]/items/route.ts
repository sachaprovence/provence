import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaOrderAddItemSchema } from "@/lib/validations/compta";
import { addOrderItem } from "@/lib/compta/order-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

/** Ajoute une unité du produit — un second appel sur le même produit incrémente la ligne existante (voir order-service.ts#addOrderItem), c'est ce qui donne le comportement "un clic = ×1, deux clics = ×2" attendu côté interface. */
export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaOrderAddItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const order = await addOrderItem(actor.organization.id, id, parsed.data.productId, actor.user.id);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/orders/[id]/items" });
  }
}
