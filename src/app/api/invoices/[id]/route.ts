import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { invoiceStatusUpdateSchema } from "@/lib/validations/invoice";
import { getInvoice, updateInvoiceStatus } from "@/lib/crm/invoice-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const invoice = await getInvoice(actor.organization.id, id);
    return NextResponse.json({ invoice });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/invoices/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = invoiceStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const invoice = await updateInvoiceStatus(actor.organization.id, id, parsed.data.status);
    return NextResponse.json({ invoice });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/invoices/[id]" });
  }
}
