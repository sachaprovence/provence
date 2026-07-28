import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { getOrgStats } from "@/lib/stats";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();

  const stats = await getOrgStats(actor.organization.id, from, to);
  return NextResponse.json({ range: { from, to }, ...stats });
}
