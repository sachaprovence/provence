import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { quoteSignatureResultSchema } from "@/lib/validations/quote";
import { recordSignatureResult } from "@/lib/crm/quote-service";

type Params = { params: Promise<{ id: string }> };

/**
 * Simule le webhook qu'un vrai fournisseur de signature électronique
 * enverrait (le fournisseur `demo` n'a aucun mécanisme réel de rappel) —
 * même principe que `/api/leads/[id]/simulate-reply` pour les emails.
 */
export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = quoteSignatureResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await recordSignatureResult(actor.organization.id, id, parsed.data.status);
    return NextResponse.json({ quote });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/quotes/[id]/signature/simulate" });
  }
}
