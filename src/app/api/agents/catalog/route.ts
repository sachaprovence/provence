import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { listCatalog } from "@/lib/agents/installation-service";

/** Catalogue des agents disponibles (globaux + propres à l'organisation) — pas de contexte de workspace requis. */
export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const definitions = await listCatalog(actor);
    return NextResponse.json({ definitions });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/agents/catalog" });
  }
}
