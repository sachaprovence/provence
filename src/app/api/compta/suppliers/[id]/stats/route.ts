import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { getSupplierPurchaseStats } from "@/lib/compta/purchase-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const stats = await getSupplierPurchaseStats(actor.organization.id, id);
    return NextResponse.json({ stats });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/suppliers/[id]/stats" });
  }
}
