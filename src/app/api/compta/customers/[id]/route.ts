import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaCustomerUpdateSchema } from "@/lib/validations/compta";
import { getCustomer, updateCustomer } from "@/lib/compta/customer-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const customer = await getCustomer(actor.organization.id, id);
    return NextResponse.json({ customer });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/customers/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaCustomerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const customer = await updateCustomer(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json({ customer });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/customers/[id]" });
  }
}
