import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaSupplierUpdateSchema } from "@/lib/validations/compta";
import { getSupplier, updateSupplier } from "@/lib/compta/supplier-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const supplier = await getSupplier(actor.organization.id, id);
    return NextResponse.json({ supplier });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/suppliers/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaSupplierUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const supplier = await updateSupplier(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json({ supplier });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/suppliers/[id]" });
  }
}
