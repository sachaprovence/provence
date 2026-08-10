import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaProductSchema } from "@/lib/validations/compta";
import { listProducts, createProduct } from "@/lib/compta/product-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  try {
    const products = await listProducts(actor.organization.id, { includeInactive });
    return NextResponse.json({ products });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/products" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);
  const parsed = comptaProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const product = await createProduct(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/products" });
  }
}
