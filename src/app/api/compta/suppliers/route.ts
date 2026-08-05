import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaSupplierSchema } from "@/lib/validations/compta";
import { listSuppliers, createSupplier } from "@/lib/compta/supplier-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const suppliers = await listSuppliers(actor.organization.id);
    return NextResponse.json({ suppliers });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/suppliers" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = comptaSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const supplier = await createSupplier(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/suppliers" });
  }
}
