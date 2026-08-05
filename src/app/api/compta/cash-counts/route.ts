import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaCashCountSchema } from "@/lib/validations/compta";
import { listCashCounts, createCashCount } from "@/lib/compta/cash-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const cashCounts = await listCashCounts(actor.organization.id);
    return NextResponse.json({ cashCounts });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/cash-counts" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = comptaCashCountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const cashCount = await createCashCount(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ cashCount }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/cash-counts" });
  }
}
