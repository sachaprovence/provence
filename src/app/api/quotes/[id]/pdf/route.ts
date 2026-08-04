import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse, NotFoundError } from "@/lib/errors";
import { generateQuotePdf } from "@/lib/crm/quote-pdf";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const [quote, organization] = await Promise.all([
      prisma.quote.findFirst({ where: { id, organizationId: actor.organization.id }, include: { lines: true, lead: true } }),
      prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } }),
    ]);
    if (!quote) throw new NotFoundError("Devis introuvable.");

    const pdfBytes = await generateQuotePdf({ organization, quote, lines: quote.lines, lead: quote.lead });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${quote.reference}.pdf"`,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quotes/[id]/pdf" });
  }
}
