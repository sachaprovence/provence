import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { createInvoiceFromVirtualTour } from "@/lib/crm/invoice-service";

type Params = { params: Promise<{ id: string }> };

/** Facturation directe depuis une visite 3D (v1.1, AR-0167) — toujours explicite, jamais automatique. */
export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const serviceId = body?.serviceId as string | undefined;
  if (!serviceId) return NextResponse.json({ error: "serviceId requis." }, { status: 400 });

  try {
    const invoice = await createInvoiceFromVirtualTour(actor.organization.id, id, serviceId, actor.user.id);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/virtual-tours/[id]/invoice" });
  }
}
