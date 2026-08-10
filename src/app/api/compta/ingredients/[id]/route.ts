import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaIngredientUpdateSchema } from "@/lib/validations/compta";
import { getIngredient, updateIngredient } from "@/lib/compta/stock-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const ingredient = await getIngredient(actor.organization.id, id);
    return NextResponse.json({ ingredient });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/ingredients/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaIngredientUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ingredient = await updateIngredient(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json({ ingredient });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/ingredients/[id]" });
  }
}
