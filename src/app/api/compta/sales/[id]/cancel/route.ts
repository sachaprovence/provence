import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaSaleCancelSchema } from "@/lib/validations/compta";
import { cancelSale } from "@/lib/compta/sale-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = comptaSaleCancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const sale = await cancelSale(actor.organization.id, id, parsed.data.reason, actor.user.id);
    return NextResponse.json({ sale });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/sales/[id]/cancel" });
  }
}
