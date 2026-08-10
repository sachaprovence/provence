import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaOrderCreateSchema } from "@/lib/validations/compta";
import { listOpenOrders, listOrderHistory, createOrder } from "@/lib/compta/order-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  try {
    if (view === "history") {
      const status = searchParams.get("status");
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      const orders = await listOrderHistory(actor.organization.id, {
        status: status === "COMPLETED" || status === "CANCELLED" ? status : undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      });
      return NextResponse.json({ orders });
    }

    const orders = await listOpenOrders(actor.organization.id);
    return NextResponse.json({ orders });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/orders" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => ({}));
  const parsed = comptaOrderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const order = await createOrder(actor.organization.id, null, parsed.data.name, actor.user.id);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/orders" });
  }
}
