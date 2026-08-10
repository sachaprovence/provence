import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaVatRateSchema } from "@/lib/validations/compta";
import { listVatRates, createVatRate } from "@/lib/compta/vat-rate-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "true";

  try {
    const rates = await listVatRates(actor.organization.id, { activeOnly });
    return NextResponse.json({ rates });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/vat-rates" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);
  const parsed = comptaVatRateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const rate = await createVatRate(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ rate }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/vat-rates" });
  }
}
