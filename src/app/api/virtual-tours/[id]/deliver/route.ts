import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { markVirtualTourDelivered } from "@/lib/production/virtual-tour-service";

type Params = { params: Promise<{ id: string }> };

/** Livraison client explicite (v1.1, AR-0167) — idempotent, jamais republiée. */
export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const virtualTour = await markVirtualTourDelivered(actor.organization.id, id);
    return NextResponse.json({ virtualTour });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/virtual-tours/[id]/deliver" });
  }
}
