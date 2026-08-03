import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { convertQuoteToInvoice } from "@/lib/crm/invoice-service";

type Params = { params: Promise<{ id: string }> };

/** Transformation d'un devis accepté en facture (brief v0.9) — toujours une action explicite. */
export async function POST(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const invoice = await convertQuoteToInvoice(actor.organization.id, id, actor.user.id);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/quotes/[id]/convert-to-invoice" });
  }
}
