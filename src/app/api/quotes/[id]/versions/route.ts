import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { listQuoteVersions } from "@/lib/crm/quote-service";

type Params = { params: Promise<{ id: string }> };

/** Historique des versions figées d'un devis (v1.1, AR-0168). */
export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const versions = await listQuoteVersions(actor.organization.id, id);
    return NextResponse.json({ versions });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quotes/[id]/versions" });
  }
}
