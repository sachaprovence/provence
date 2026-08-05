import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaSaleSchema } from "@/lib/validations/compta";
import { listSales, createSale } from "@/lib/compta/sale-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const sales = await listSales(actor.organization.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return NextResponse.json({ sales });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/sales" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = comptaSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const sale = await createSale(actor.organization.id, parsed.data, actor.user.id);
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/sales" });
  }
}
