import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaStockCorrectionSchema } from "@/lib/validations/compta";
import { correctStock } from "@/lib/compta/stock-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaStockCorrectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ingredient = await correctStock(actor.organization.id, id, parsed.data.newQuantity, parsed.data.reason, actor.user.id);
    return NextResponse.json({ ingredient });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/ingredients/[id]/correct" });
  }
}
