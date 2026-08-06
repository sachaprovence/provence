import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaIngredientSchema } from "@/lib/validations/compta";
import { listIngredients, createIngredient } from "@/lib/compta/stock-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const ingredients = await listIngredients(actor.organization.id);
    return NextResponse.json({ ingredients });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/ingredients" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);
  const parsed = comptaIngredientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ingredient = await createIngredient(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ ingredient }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/ingredients" });
  }
}
