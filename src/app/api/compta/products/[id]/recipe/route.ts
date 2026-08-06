import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaRecipeSchema } from "@/lib/validations/compta";
import { getRecipe, setRecipe } from "@/lib/compta/stock-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const recipe = await getRecipe(actor.organization.id, id);
    return NextResponse.json({ recipe });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/products/[id]/recipe" });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaRecipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const recipe = await setRecipe(actor.organization.id, id, parsed.data.lines, actor.user.id);
    return NextResponse.json({ recipe });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PUT /api/compta/products/[id]/recipe" });
  }
}
