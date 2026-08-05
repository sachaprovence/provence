import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaProductUpdateSchema } from "@/lib/validations/compta";
import { getProduct, updateProduct } from "@/lib/compta/product-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const product = await getProduct(actor.organization.id, id);
    return NextResponse.json({ product });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/products/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const product = await updateProduct(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json({ product });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/products/[id]" });
  }
}
