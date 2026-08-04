import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { virtualTourCreateSchema } from "@/lib/validations/virtual-tour";
import { listVirtualTours, createVirtualTour } from "@/lib/production/virtual-tour-service";
import type { VirtualTourStatus } from "@/generated/prisma/enums";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId") ?? undefined;
  const status = (searchParams.get("status") as VirtualTourStatus | null) ?? undefined;

  try {
    const virtualTours = await listVirtualTours(actor.organization.id, { leadId, status });
    return NextResponse.json({ virtualTours });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/virtual-tours" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const body = await request.json().catch(() => null);
  const parsed = virtualTourCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const virtualTour = await createVirtualTour(actor.organization.id, parsed.data);
    return NextResponse.json({ virtualTour }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/virtual-tours" });
  }
}
