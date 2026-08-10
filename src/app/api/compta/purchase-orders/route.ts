import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaPurchaseOrderSchema } from "@/lib/validations/compta";
import { listPurchaseOrders, createPurchaseOrder } from "@/lib/compta/purchase-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId") ?? undefined;

  try {
    const purchaseOrders = await listPurchaseOrders(actor.organization.id, { supplierId });
    return NextResponse.json({ purchaseOrders });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/purchase-orders" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);
  const parsed = comptaPurchaseOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const purchaseOrder = await createPurchaseOrder(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ purchaseOrder }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/purchase-orders" });
  }
}
