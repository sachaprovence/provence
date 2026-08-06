import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { exportSalesJournalPdf } from "@/lib/compta/export-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const pdfBytes = await exportSalesJournalPdf(actor.organization.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="livre-des-recettes.pdf"' },
    });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/exports/sales-journal-pdf" });
  }
}
