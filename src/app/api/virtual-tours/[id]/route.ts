import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { virtualTourUpdateSchema } from "@/lib/validations/virtual-tour";
import { getVirtualTour, updateVirtualTour } from "@/lib/production/virtual-tour-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const virtualTour = await getVirtualTour(actor.organization.id, id);
    return NextResponse.json({ virtualTour });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/virtual-tours/[id]" });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = virtualTourUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const virtualTour = await updateVirtualTour(actor.organization.id, id, parsed.data);
    return NextResponse.json({ virtualTour });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PUT /api/virtual-tours/[id]" });
  }
}
