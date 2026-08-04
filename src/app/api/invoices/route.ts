import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { listInvoices } from "@/lib/crm/invoice-service";

/**
 * Aucun POST direct ici : une facture ne se crée jamais que par
 * transformation explicite d'un devis accepté (voir
 * `/api/quotes/[id]/convert-to-invoice` et ADR 0038).
 */
export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId") ?? undefined;

  try {
    const invoices = await listInvoices(actor.organization.id, { leadId });
    return NextResponse.json({ invoices });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/invoices" });
  }
}
