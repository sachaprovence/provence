import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { listTopSellingProducts } from "@/lib/compta/sale-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const days = searchParams.get("days");
  const limit = searchParams.get("limit");

  try {
    const topProducts = await listTopSellingProducts(actor.organization.id, {
      days: days ? Number(days) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return NextResponse.json({ topProducts });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/sales/top-selling" });
  }
}
