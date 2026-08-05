import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { quoteSignatureRequestSchema } from "@/lib/validations/quote";
import { requestQuoteSignature } from "@/lib/crm/quote-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = quoteSignatureRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await requestQuoteSignature(actor.organization.id, id, parsed.data);
    return NextResponse.json({ quote });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quotes/[id]/signature/request" });
  }
}
