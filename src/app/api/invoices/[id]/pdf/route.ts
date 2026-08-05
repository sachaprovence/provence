import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse, NotFoundError } from "@/lib/errors";
import { generateInvoicePdf } from "@/lib/crm/invoice-pdf";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const [invoice, organization] = await Promise.all([
      prisma.invoice.findFirst({ where: { id, organizationId: actor.organization.id }, include: { lines: true, lead: true } }),
      prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } }),
    ]);
    if (!invoice) throw new NotFoundError("Facture introuvable.");

    const pdfBytes = await generateInvoicePdf({ organization, invoice, lines: invoice.lines, lead: invoice.lead });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.reference}.pdf"`,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/invoices/[id]/pdf" });
  }
}
