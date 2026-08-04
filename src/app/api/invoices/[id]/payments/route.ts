import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { invoicePaymentCreateSchema } from "@/lib/validations/invoice";
import { listInvoicePayments, recordInvoicePayment } from "@/lib/crm/invoice-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const payments = await listInvoicePayments(actor.organization.id, id);
    return NextResponse.json({ payments });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/invoices/[id]/payments" });
  }
}

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = invoicePaymentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const payment = await recordInvoicePayment(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/invoices/[id]/payments" });
  }
}
