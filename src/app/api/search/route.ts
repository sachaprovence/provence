import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { globalSearch } from "@/lib/search/global-search-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    const results = await globalSearch(actor.organization.id, query);
    return NextResponse.json({ results });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/search" });
  }
}
