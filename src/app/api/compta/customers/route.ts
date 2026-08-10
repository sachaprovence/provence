import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaCustomerSchema } from "@/lib/validations/compta";
import { listCustomers, createCustomer } from "@/lib/compta/customer-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const customers = await listCustomers(actor.organization.id);
    return NextResponse.json({ customers });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/customers" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);
  const parsed = comptaCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const customer = await createCustomer(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/customers" });
  }
}
