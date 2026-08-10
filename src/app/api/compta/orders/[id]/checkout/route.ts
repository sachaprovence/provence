import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaOrderCheckoutSchema } from "@/lib/validations/compta";
import { checkoutOrder } from "@/lib/compta/order-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

/** Encaisse une commande — voir order-service.ts#checkoutOrder pour la protection contre le double-clic (claim atomique côté base, pas seulement côté interface). */
export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaOrderCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await checkoutOrder(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/orders/[id]/checkout" });
  }
}
