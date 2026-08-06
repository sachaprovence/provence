import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { exportVatJournalPdf } from "@/lib/compta/export-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  try {
    const pdfBytes = await exportVatJournalPdf(actor.organization.id, year);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="journal-tva-${year}.pdf"` },
    });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/exports/vat-journal-pdf" });
  }
}
