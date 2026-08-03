import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { quoteDraftUpdateSchema } from "@/lib/validations/quote";
import { updateQuoteDraft } from "@/lib/crm/quote-service";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = quoteDraftUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await updateQuoteDraft(actor.organization.id, id, parsed.data);
    return NextResponse.json({ quote });
  } catch (error) {
    return toApiErrorResponse(error, { route: "PUT /api/quotes/[id]/draft" });
  }
}
